import type { Page, Request } from '@playwright/test';
import { giveOwnClientAddress } from './account/sign-in';
import { expect, expectNoPageErrors, mintSignedGuest, ownerHeaders, test } from './fixtures';

// Report a Bug (docs/specs/016-platform/bug-reports.md), end to end on a stack with no Bug Tracker configured, so
// every report is stored and the form says so: a guest from the editor's bottom bar with a screenshot, a link
// visitor, and the help centre's way in through the form's own page. Signed in: account/bug-report.spec.ts.

test.use({ colorScheme: 'dark' });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const ENTRY = '[data-bug-report-entry][aria-label="Report a Bug"]';

type SentReport = {
  title: string;
  context?: Record<string, unknown>;
  screenshot?: { contentType: string };
};

function watchReports(page: Page): { sent: SentReport[]; headers: Record<string, string>[] } {
  const watched = { sent: [] as SentReport[], headers: [] as Record<string, string>[] };
  page.on('request', (r: Request) => {
    if (r.method() !== 'POST' || !r.url().endsWith('/bug-reports')) return;
    watched.sent.push(JSON.parse(r.postData() ?? '{}') as SentReport);
    watched.headers.push(r.headers());
  });
  return watched;
}

async function sendReport(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
  await dialog.getByRole('textbox', { name: 'What went wrong?' }).fill(title);
  await dialog.getByRole('button', { name: 'Send Report' }).click();
  await expect(dialog.getByText('Thanks for the report')).toBeVisible();
  // No Bug Tracker on this stack: stored, never lost.
  await expect(dialog.getByText('Saved; we will file it shortly.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
}

test('a guest reports a bug from the bottom bar, with a screenshot', async ({
  page,
  context,
  baseURL,
  pageErrors,
}) => {
  // Reports are limited per network: each test reports from an address of its own.
  await giveOwnClientAddress(context, baseURL!);
  const watched = watchReports(page);
  await page.goto('/new?blank=1');
  await page.locator('[data-canvas-a11y-root]').waitFor();

  const entry = page.locator(ENTRY);
  await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
  await entry.click();
  const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
  await expect(dialog).toBeVisible();
  // A screenshot is opt-in: nothing is attached until asked.
  await expect(dialog.getByRole('img')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Capture Screen' }).click();
  await expect(dialog.getByRole('img', { name: 'Screenshot to send' })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByText("What's Attached").click();
  await expect(dialog.getByText('/document', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Your guest id')).toBeVisible();

  await sendReport(page, 'The canvas jumps when I zoom');
  await expect(entry).toBeFocused();

  const [report] = watched.sent;
  expect(report?.title).toBe('The canvas jumps when I zoom');
  // The page as its template, never the document's id.
  expect(report?.context).toMatchObject({
    route: '/document',
    shareRole: 'owner',
    tabKind: 'diagram',
  });
  expect(JSON.stringify(report?.context)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(report?.screenshot?.contentType).toMatch(/^image\/(webp|jpeg)$/);
  expect(watched.headers[0]?.['x-owner-id']).toBeTruthy();
  expectNoPageErrors(pageErrors);
});

test('a link visitor reports a bug, their share role attached', async ({
  page,
  browser,
  baseURL,
}) => {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL!).origin });
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Shared notes',
      tabs: [{ id: crypto.randomUUID(), name: 'Notes', elements: [] }],
    },
  });
  expect(seeded.ok()).toBe(true);
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;

  const visitorContext = await browser.newContext({ colorScheme: 'dark' });
  await giveOwnClientAddress(visitorContext, baseURL!);
  const visitor = await visitorContext.newPage();
  const watched = watchReports(visitor);
  await visitor.goto(`/document/shared?s=${code}`);
  await visitor.getByRole('button', { name: /^join$/i }).click();
  await visitor.locator('[data-canvas-a11y-root]').waitFor();
  await visitor.locator(ENTRY).click();
  await sendReport(visitor, 'I cannot vote on a sticky');
  expect(watched.sent[0]?.context).toMatchObject({ route: '/document', shareRole: 'participate' });
  expect(JSON.stringify(watched.sent[0])).not.toContain(code);
  await visitorContext.close();
});

test("the form's own page names where it came from, and closing goes back", async ({
  page,
  context,
  baseURL,
}) => {
  await giveOwnClientAddress(context, baseURL!);
  const watched = watchReports(page);
  await page.goto('/new?blank=1');
  await page.locator('[data-canvas-a11y-root]').waitFor();
  const cameFrom = page.url();
  await page.goto('/report-a-bug?from=/help/contact/');
  const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
  await expect(dialog).toBeVisible();
  await sendReport(page, 'A broken link on the FAQ');
  expect(watched.sent[0]?.context).toMatchObject({ route: '/report-a-bug', from: '/help/contact' });
  await expect(page).toHaveURL(cameFrom);
});

test('an error card offers Report a Bug beside Try again', async ({ page }) => {
  await page.route(/\/api\/documents\/[0-9a-f-]{36}(\?.*)?$/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto(`/document/${crypto.randomUUID()}`);
  const button = page.getByRole('button', { name: 'Report a Bug' });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 30_000 });
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Report a Bug' })).toBeVisible();
});

// A 2x2 PNG, enough for the encoder to take.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO4o6bGt/Qlg8DOxq/zuAEmbAWtK9LTXQAAAABJRU5ErkJggg==',
  'base64',
);

test('an unsent report survives closing and a reload, its image too, until it is sent', async ({
  page,
  context,
  baseURL,
  pageErrors,
}) => {
  await giveOwnClientAddress(context, baseURL!);
  const watched = watchReports(page);
  await page.goto('/report-a-bug');
  const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
  const title = dialog.getByRole('textbox', { name: 'What went wrong?' });
  const details = dialog.getByRole('textbox', { name: /More details/ });
  await title.fill('Export loses the arrows');
  await details.fill('Only on the second tab');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(dialog.getByRole('img', { name: 'Screenshot to send' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto('/report-a-bug');
  await expect(title).toHaveValue('Export loses the arrows');
  await expect(details).toHaveValue('Only on the second tab');
  await expect(dialog.getByRole('img', { name: 'Screenshot to send' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Send Report' }).click();
  await expect(dialog.getByText('Thanks for the report')).toBeVisible();
  expect(watched.sent[0]?.screenshot?.contentType).toMatch(/^image\/(webp|jpeg)$/);

  await page.goto('/report-a-bug');
  await expect(title).toHaveValue('');
  await expect(dialog.getByRole('img')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
