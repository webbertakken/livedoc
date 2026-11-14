import { expect, test } from '@playwright/test';
import {
  apiJson,
  mintTicket,
  newPerson,
  received,
  seedDocumentAndToken,
  serveFakeWorkbench,
  ticketOf,
  type FakeWorkbench,
} from './workbench-support';

// The workbench embed end to end (docs/specs/013-workspace/workbench-embeds.md, "Testing"):
// a fake workbench on http://127.0.0.1:<port> frames the live app on http://localhost:<port>. Opt-in
// (E2E_WORKBENCH=1, `pnpm test:e2e:workbench`): it needs the signed-in stack for the pairing page and
// the api calls the CLI makes.

let workbench: FakeWorkbench;
let elsewhere: FakeWorkbench;

test.beforeAll(async () => {
  workbench = await serveFakeWorkbench();
  elsewhere = await serveFakeWorkbench();
});

test.afterAll(async () => {
  await workbench.close();
  await elsewhere.close();
});

test('a paired workbench frames the editor, hears the selection, renews, and ends on Unpair', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seedDocumentAndToken(request, person);

  // Unpaired: the mint asks for a pairing, and the person allows it in their own browser.
  const unpaired = await mintTicket(request, seeded, workbench.origin);
  expect(unpaired.status).toBe(428);
  await page.goto(unpaired.body.pairingUrl!);
  await expect(page.getByRole('heading', { name: 'Allow this workbench?' })).toBeVisible();
  await expect(page.getByText(workbench.origin)).toBeVisible();
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workbench allowed' })).toBeVisible();

  // Paired: the mint answers a frame URL, and the workbench frames it.
  const minted = await mintTicket(request, seeded, workbench.origin);
  expect(minted.status).toBe(201);
  const sessionCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/workbench/sessions')) sessionCalls.push(req.method());
  });
  await workbench.open(page, minted.body.url!);
  const frame = page.frameLocator('#frame');
  await frame.locator('[data-canvas-a11y-root]').waitFor();
  await expect(frame.locator('[data-element-id="el-play"]').first()).toBeVisible();

  // The workbench chrome: no app header, Explorer or Share; the tab bar and Open in LiveDoc stay.
  await expect(
    frame.getByRole('link', { name: 'Open in LiveDoc (opens in a new tab)' }),
  ).toBeVisible();
  await expect(frame.getByRole('button', { name: /^Share/ })).toHaveCount(0);
  // Back is the regular editor's (I10): caret and mark, the hover fill, opening the Explorer in a new tab.
  const back = frame.getByRole('link', { name: 'Back to the Explorer (opens in a new tab)' });
  await expect(back).toHaveAttribute('target', '_blank');
  await expect(back.locator('[data-back-caret]')).toBeVisible();
  const fill = () => back.evaluate((el) => getComputedStyle(el).backgroundColor);
  const resting = await fill();
  await back.hover();
  await expect.poll(fill).not.toBe(resting);
  await page.mouse.move(1, 1);
  await expect(frame.getByText('Explorer', { exact: true })).toHaveCount(0);
  await expect(frame.getByText('Wireframe').first()).toBeVisible();
  await expect
    .poll(async () => (await received(page)).map((m) => m.type))
    .toEqual(expect.arrayContaining(['livedoc:hello', 'livedoc:ready']));
  const ready = (await received(page)).find((m) => m.type === 'livedoc:ready');
  expect(ready).toMatchObject({
    documentId: seeded.documentId,
    documentName: 'Home screen',
    role: 'edit',
  });

  // Drawing saves through the session.
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width / 2 + 200, viewport.height / 2);
  await page.keyboard.press('r');
  await page.mouse.move(viewport.width / 2 + 150, viewport.height / 2 - 40);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 300, viewport.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.type('Scores');
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () => {
        const tab = await apiJson<{ tab: { elements: unknown[] } }>(
          request,
          'GET',
          `/documents/${seeded.documentId}/tabs/${seeded.tabId}`,
          person.jwt,
        );
        return tab.body.tab.elements.length;
      },
      { timeout: 15_000 },
    )
    .toBe(2);

  // A selection arrives once it settles, as the selection reference.
  // The drawn square stays selected, so its reference arrives first; then the click on Play.
  const selectionOf = async (label: string) =>
    (await received(page)).find(
      (m) =>
        m.type === 'livedoc:selection' &&
        m.count === 1 &&
        String(m.reference).includes(`"${label}"`),
    );
  await frame.locator('[data-element-id="el-play"]').first().click();
  await expect.poll(() => selectionOf('Play')).toBeTruthy();
  const selection = (await selectionOf('Play'))!;
  expect(selection.reference).toMatch(/^\[LiveDoc\] "Home screen" › tab "Wireframe" \(doc /);
  expect(selection.reference).toContain('"Play"');
  expect(selection.reference).toContain(`read: livedoc tab view ${seeded.documentId}`);

  // Reveal outlines the element; the theme follows the workbench.
  await page.evaluate(() =>
    (window as unknown as { post: (m: unknown) => void }).post({
      type: 'livedoc:reveal',
      v: 1,
      refs: ['el-play'],
    }),
  );
  await expect(frame.locator('[data-changeset-reveal]')).not.toHaveCount(0);
  const isDark = () => frame.locator('html').evaluate((html) => html.classList.contains('dark'));
  for (const colourScheme of ['light', 'dark'] as const) {
    await page.evaluate(
      (scheme) =>
        (window as unknown as { post: (m: unknown) => void }).post({
          type: 'livedoc:theme',
          v: 1,
          colourScheme: scheme,
        }),
      colourScheme,
    );
    await expect.poll(isDark).toBe(colourScheme === 'dark');
  }

  // Renewal: a fresh ticket swaps the session and ends the old one.
  const renewal = await mintTicket(request, seeded, workbench.origin);
  await page.evaluate(
    (ticket) =>
      (window as unknown as { post: (m: unknown) => void }).post({
        type: 'livedoc:ticket',
        v: 1,
        ticket,
      }),
    ticketOf(renewal.body.url!),
  );
  await expect.poll(() => sessionCalls).toEqual(['POST', 'POST', 'DELETE']);

  // Unpair: the room closes the frame's socket, the frame turns read-only and says how to edit again.
  const pairings = await apiJson<{ pairings: { id: string; origin: string }[] }>(
    request,
    'GET',
    '/workbench/pairings',
    person.jwt,
  );
  const pairing = pairings.body.pairings.find((p) => p.origin === workbench.origin)!;
  const unpaired204 = await apiJson(
    request,
    'DELETE',
    `/workbench/pairings/${pairing.id}`,
    person.jwt,
  );
  expect(unpaired204.status).toBe(204);
  await expect(
    frame.getByRole('status').filter({ hasText: 'Reconnect in Fake Workbench to keep editing.' }),
  ).toBeVisible();
  await expect
    .poll(async () => (await received(page)).find((m) => m.type === 'livedoc:ended'))
    .toMatchObject({ reason: 'revoked' });
});

// docs/specs/016-platform/bug-reports.md "From an embed": the person reports from the frame, screenshot and context
// included, filed as their account, inside a host that sandboxes its frame.
test('a person reports a bug from inside a sandboxed workbench frame', async ({
  page,
  context,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seedDocumentAndToken(request, person);
  const unpaired = await mintTicket(request, seeded, workbench.origin);
  await page.goto(unpaired.body.pairingUrl!);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workbench allowed' })).toBeVisible();
  const minted = await mintTicket(request, seeded, workbench.origin);
  const reports: { status: number; body: Record<string, unknown> }[] = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST' || !req.url().endsWith('/api/bug-reports')) return;
    reports.push({ status: res.status(), body: req.postDataJSON() as Record<string, unknown> });
  });

  await workbench.open(page, minted.body.url!, {
    sandbox:
      'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
  });
  const frame = page.frameLocator('#frame');
  await frame.locator('[data-canvas-a11y-root]').waitFor();
  await frame.locator('[data-bug-report-entry][aria-label="Report a Bug"]').click();
  const dialog = frame.getByRole('dialog', { name: 'Report a Bug' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'What went wrong?' }).fill('The sticky snaps back');
  await dialog.getByRole('button', { name: 'Capture Screen' }).click();
  await expect(dialog.getByRole('img', { name: 'Screenshot to send' })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByText("What's Attached").click();
  await expect(dialog.getByText('Your account id')).toBeVisible();
  await expect(dialog.getByText('Embedded', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('bug-report-in-workbench.png') });

  await dialog.getByRole('button', { name: 'Send Report' }).click();

  await expect(dialog.getByText('Thanks for the report')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('bug-report-in-workbench-sent.png') });
  expect(reports).toHaveLength(1);
  expect(reports[0]!.status).toBe(202);
  expect(reports[0]!.body).toMatchObject({
    title: 'The sticky snaps back',
    context: { route: '/embed/workbench', embedded: true },
    screenshot: { contentType: expect.stringMatching(/^image\//) },
  });
});

// docs/specs/013-workspace/workbench-embeds.md "What renders": a frame that opens narrow (a workbench's panel sliding
// open) and widens to a computer's width keeps the Palette strip in the top line's middle, as the app's editor does.
test('a frame that opens narrow and widens keeps the strip on the top line', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seedDocumentAndToken(request, person);
  const unpaired = await mintTicket(request, seeded, workbench.origin);
  await page.goto(unpaired.body.pairingUrl!);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workbench allowed' })).toBeVisible();
  const minted = await mintTicket(request, seeded, workbench.origin);

  await page.setViewportSize({ width: 1460, height: 860 });
  await workbench.open(page, minted.body.url!, {
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
  });
  const host = page.locator('#frame');
  const size = (width: number) =>
    host.evaluate(
      (el, w) => Object.assign((el as HTMLElement).style, { width: `${w}px`, height: '760px' }),
      width,
    );
  await size(480);
  const frame = page.frameLocator('#frame');
  await frame.locator('[data-canvas-a11y-root]').waitFor();
  const card = frame.locator('[data-tour-id="palette"]');
  await expect(card).toBeVisible();

  await size(1414);
  const tops = () =>
    Promise.all(
      ['[data-toolbar-menu]', '[data-tour-id="palette"]'].map((s) =>
        frame.locator(s).evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      ),
    );
  await expect.poll(async () => new Set(await tops()).size).toBe(1);
});

test('a page of another origin framing the URL mounts nothing', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const person = await newPerson(context, baseURL!, 'Webber');
  const seeded = await seedDocumentAndToken(request, person);
  const unpaired = await mintTicket(request, seeded, workbench.origin);
  await page.goto(unpaired.body.pairingUrl!);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workbench allowed' })).toBeVisible();
  const minted = await mintTicket(request, seeded, workbench.origin);

  // The URL minted for `workbench` lands in a page of `elsewhere`'s origin.
  await elsewhere.open(page, minted.body.url!);
  const frame = page.frameLocator('#frame');

  await expect(
    frame.getByRole('heading', { name: `This view opens only inside ${workbench.origin}.` }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(frame.locator('[data-canvas-a11y-root]')).toHaveCount(0);
  expect(await received(page)).toEqual([]);
});

test('the fake workbench frames only an http(s) loopback address', async ({ page }) => {
  await page.goto(`${workbench.origin}/`);
  const open = (url: string) =>
    page.evaluate(
      (u) => (window as unknown as { openFrame: (v: string) => boolean }).openFrame(u),
      url,
    );

  for (const url of ['javascript:alert(1)', 'https://example.com/embed/workbench', 'not a url']) {
    expect(await open(url)).toBe(false);
  }
  await expect(page.getByRole('alert')).toHaveText(
    'Refused: the fake workbench frames only an http(s) loopback address.',
  );
  expect(await page.locator('#frame').getAttribute('src')).toBeNull();
});
