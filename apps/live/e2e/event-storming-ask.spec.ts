import type { Locator, Page, Route } from '@playwright/test';
import type { StormAskRequest } from '@livedoc/api-schema';
import { ASK_BOARD_IDS as IDS, askAnswer, startAskBoard } from './ask-board';
import { freshDarkPage } from './audit-screens';
import { expect, pageOwnerHeaders, test } from './fixtures';

// Asks in the editor (docs/specs/021-event-storming/asks.md "Where an ask starts", "The built-in hand"), in a real
// browser, the model stubbed at the route: what only a browser can answer is whether the pill stands in the corner
// of a board with nothing suggested, whether the popover hangs under it and hands the focus back, whether a prompt
// reaches the clipboard, whether what the model answers lands as one step the server holds and one Undo takes back,
// and whether every other way in opens that same popover about what it stands for.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

type Stored = { id: string; esSuggestion?: { by?: string }; esLanePlan?: unknown };
type StoredTab = { elements: Stored[]; esAbout?: string; esDeclined?: unknown[] };

async function storedTab(page: Page): Promise<StoredTab> {
  // Let the debounced autosave flush before asking the server what it has.
  await page.waitForTimeout(1500);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page);
  return page.evaluate(
    async ({ base, headers }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
        document: { tabs: { id: string }[] };
      };
      const tabId = doc.document.tabs[0]!.id;
      const tab = (await (
        await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
      ).json()) as { tab: StoredTab };
      return tab.tab;
    },
    { base: apiBase, headers },
  );
}

const suggestedIds = (tab: StoredTab) =>
  tab.elements.filter((el) => el.esSuggestion).map((el) => el.id);

const note = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const corner = (page: Page) => page.getByTestId('suggestions-panel');
const pill = (page: Page) => corner(page).getByRole('button', { name: 'Ask', exact: true });
const count = (page: Page, words: string) =>
  corner(page).getByRole('button', { name: words, exact: true });
const popover = (page: Page) => page.getByRole('dialog', { name: 'Ask for Suggestions' });
const topic = (page: Page, name: string) => popover(page).getByRole('radio', { name, exact: true });
const hand = (page: Page, name: RegExp) => popover(page).getByRole('radio', { name });
// A hand is picked by its label: its radio is there for the keyboard and for assistive technology alone.
const pickHand = (page: Page, name: string) =>
  popover(page)
    .getByRole('group', { name: 'Who answers' })
    .locator('label')
    .filter({ hasText: name })
    .click();
const contextName = (page: Page, name: string) =>
  page.getByRole('button', { name: `Candidate context: ${name}`, exact: true });

const topicsOf = (page: Page) =>
  popover(page).getByRole('group', { name: 'What to ask for' }).getByRole('radio');

async function topicNames(page: Page): Promise<string[]> {
  const labels = popover(page).getByRole('group', { name: 'What to ask for' }).locator('label');
  return (await labels.allTextContents()).map((words) => words.trim());
}

async function run(page: Page, command: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog', { name: 'Search' });
  await search.getByRole('combobox', { name: 'Search' }).fill(command);
  await search.getByRole('option', { name: command, exact: true }).click();
  await expect(search).toHaveCount(0);
}

// The built-in hand's route, answered here: what it was asked, and a way to hold the answer back.
async function stubModel(
  page: Page,
  answer: (route: Route) => Promise<void> = (route) => route.fulfill({ json: askAnswer() }),
): Promise<{ asked: StormAskRequest[] }> {
  const asked: StormAskRequest[] = [];
  await page.route('**/api/storm-ask', async (route) => {
    asked.push(route.request().postDataJSON() as StormAskRequest);
    await answer(route);
  });
  return { asked };
}

async function askBuiltIn(page: Page): Promise<void> {
  await pickHand(page, 'Built-in');
  await popover(page).getByRole('button', { name: 'Ask', exact: true }).click();
}

const right = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return box.x + box.width;
};

test('the Ask pill leads the corner of a board with nothing suggested; its popover hangs under it and hands the focus back', async ({
  page,
}) => {
  await startAskBoard(page);
  await expect(pill(page)).toBeVisible();
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'false');
  // Nothing is suggested: no count, no list; the Review pill stands after it.
  await expect(corner(page).getByRole('button')).toHaveText(['Ask', 'Review']);

  await pill(page).click();
  await expect(popover(page)).toBeVisible();
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(popover(page)).toContainText('About the board');
  expect(await topicNames(page)).toEqual([
    'Fill the Gaps',
    'Group into Contexts',
    'Sharpen the Wording',
    'Reorganise into Lanes',
  ]);
  await expect(topic(page, 'Fill the Gaps')).toBeChecked();
  // The CLI first and recommended; the deployment has a model, so three hands.
  await expect(hand(page, /^CLI/)).toBeChecked();
  await expect(popover(page).getByRole('group', { name: 'Who answers' })).toContainText(
    'Recommended',
  );
  await expect(hand(page, /^MCP/)).toBeVisible();
  await expect(hand(page, /^Built-in/)).toBeVisible();
  await expect(popover(page).getByRole('button', { name: 'Arrange and Reorder' })).toBeVisible();
  await expect(popover(page).getByLabel('About This Domain')).toHaveValue('');
  // Nothing was declined, so nothing to forget.
  await expect(popover(page).getByRole('button', { name: 'Forget Declined' })).toHaveCount(0);

  // Under the corner, its right edge on the corner's, inside the window.
  const cornerBox = (await corner(page).boundingBox())!;
  const box = (await popover(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(cornerBox.y + cornerBox.height);
  expect(Math.abs((await right(popover(page))) - (await right(corner(page))))).toBeLessThanOrEqual(
    2,
  );
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  // Focus moved in; Escape closes it and the pill has the focus again.
  expect(await popover(page).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  await expect(pill(page)).toBeFocused();

  // The pill closes what it opened.
  await pill(page).click();
  await expect(popover(page)).toBeVisible();
  await pill(page).click();
  await expect(popover(page)).toHaveCount(0);
});

test('Copy Prompt puts a prompt that names the board by its ids on the clipboard, and the hand is remembered', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startAskBoard(page);
  const documentId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!;
  await pill(page).click();

  await popover(page).getByRole('button', { name: 'Copy Prompt' }).click();
  await expect(popover(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(popover(page)).toContainText(
    'Paste it into your agent. Its suggestions appear here as it works.',
  );
  const cli = await page.evaluate(() => navigator.clipboard.readText());
  expect(cli).toContain('Suggest the notes this board is missing.');
  expect(cli).toContain(`livedoc storm read ${documentId} --tab `);
  expect(cli).toContain(`livedoc storm suggest ${documentId} --tab `);
  expect(cli).toContain('Answer with suggestions only.');
  expect(cli).toMatch(/https?:\/\/\S+#t=\S+/);

  // Another topic and another hand: another prompt, built from the same parts.
  await topic(page, 'Reorganise into Lanes').check();
  await pickHand(page, 'MCP');
  await popover(page)
    .getByRole('button', { name: /^(Copy Prompt|Copied)$/ })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('read_event_storming');
  const mcp = await page.evaluate(() => navigator.clipboard.readText());
  expect(mcp).toContain('Reorganise this board into 4 lanes.');
  expect(mcp).toContain('suggest_notes');
  expect(mcp).not.toContain('livedoc storm read');

  // The hand last used is this device's.
  await page.reload();
  await note(page, IDS.orderTaken).waitFor();
  await pill(page).click();
  await expect(hand(page, /^MCP/)).toBeChecked();
});

test('Ask adds what the model answers as one step, onto the server’s board; one Undo takes it back; the list and the popover share the corner', async ({
  page,
}) => {
  await startAskBoard(page);
  const model = await stubModel(page);
  await pill(page).click();
  await askBuiltIn(page);

  await expect(page.getByText('2 suggestions added', { exact: true })).toBeVisible();
  // It closed on what it added, and the corner now counts them.
  await expect(popover(page)).toHaveCount(0);
  await expect(count(page, '2 suggestions')).toBeVisible();
  expect(model.asked).toHaveLength(1);
  expect(model.asked[0]).toMatchObject({ topic: 'gaps', scope: { type: 'board' } });
  expect(model.asked[0]!.tab.kind).toBe('event-storming');
  expect(model.asked[0]!.tab.elements.map((el) => el.id)).toContain(IDS.orderTaken);

  const after = await storedTab(page);
  expect(suggestedIds(after).sort()).toEqual([IDS.billPaid, IDS.dishSentBack].sort());
  expect(after.elements.find((el) => el.id === IDS.billPaid)!.esSuggestion!.by).toBe(
    'Built-in model',
  );

  // One corner: the list opens, the popover takes its place, and the list takes it back.
  await count(page, '2 suggestions').click();
  await expect(corner(page).getByRole('listitem')).toHaveCount(2);
  await pill(page).click();
  await expect(popover(page)).toBeVisible();
  await expect(corner(page).getByRole('listitem')).toHaveCount(0);
  await count(page, '2 suggestions').click();
  await expect(corner(page).getByRole('listitem')).toHaveCount(2);
  await expect(popover(page)).toHaveCount(0);
  await count(page, '2 suggestions').click();

  await page.locator('body').click({ position: { x: 8, y: page.viewportSize()!.height / 2 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(count(page, '2 suggestions')).toHaveCount(0);
  await expect(pill(page)).toBeVisible();
  expect(suggestedIds(await storedTab(page))).toEqual([]);
});

test('a failure says why and what to do; Cancel ends an ask, and closing the popover does not', async ({
  page,
}) => {
  await startAskBoard(page);
  let release: () => void = () => {};
  let answer: 'refuse' | 'hold' = 'refuse';
  await stubModel(page, async (route) => {
    if (answer === 'refuse') {
      await route.fulfill({ status: 502, json: { error: 'ai_failed', message: 'no answer' } });
      return;
    }
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: askAnswer() }).catch(() => {});
  });
  await pill(page).click();
  await askBuiltIn(page);
  await expect(popover(page).getByRole('alert')).toHaveText(
    'The model did not answer. Copy the prompt for your agent instead.',
  );
  // It stays open, to ask again or to copy the prompt.
  await expect(popover(page).getByRole('button', { name: 'Ask', exact: true })).toBeVisible();

  // An ask under way says so and can be cancelled: its answer, when it comes, is not added.
  answer = 'hold';
  await popover(page).getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(popover(page)).toContainText('Asking the model…');
  await expect(popover(page).getByRole('alert')).toHaveCount(0);
  await popover(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(popover(page).getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(400);
  await expect(count(page, '2 suggestions')).toHaveCount(0);

  // Closing the popover is not cancelling: the answer lands on the board behind it.
  await popover(page).getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(popover(page)).toContainText('Asking the model…');
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  release();
  await expect(page.getByText('2 suggestions added', { exact: true })).toBeVisible();
  await expect(count(page, '2 suggestions')).toBeVisible();
});

test('About This Domain is kept as one step when the popover closes, travels with an ask, and Undo takes it back', async ({
  page,
}) => {
  await startAskBoard(page);
  const about = 'A neighbourhood restaurant. Say “table”, never “customer”.';
  await pill(page).click();
  await popover(page).getByLabel('About This Domain').fill(about);
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  expect((await storedTab(page)).esAbout).toBe(about);

  const model = await stubModel(page);
  await pill(page).click();
  await expect(popover(page).getByLabel('About This Domain')).toHaveValue(about);
  await askBuiltIn(page);
  await expect(page.getByText('2 suggestions added', { exact: true })).toBeVisible();
  expect(model.asked[0]!.tab.esAbout).toBe(about);

  // Two steps were taken: the answer, then the About.
  await page.locator('body').click({ position: { x: 8, y: page.viewportSize()!.height / 2 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(count(page, '2 suggestions')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await storedTab(page)).esAbout ?? '').toBe('');
  await pill(page).click();
  await expect(popover(page).getByLabel('About This Domain')).toHaveValue('');
});

test('what was dismissed is counted in the popover, and Forget Declined empties the list', async ({
  page,
}) => {
  await startAskBoard(page);
  await stubModel(page);
  await pill(page).click();
  await askBuiltIn(page);
  await count(page, '2 suggestions').click();
  await corner(page)
    .getByRole('button', { name: /^Dismiss suggestion: .*Bill paid/ })
    .click();
  await expect(count(page, '1 suggestion')).toBeVisible();
  expect((await storedTab(page)).esDeclined).toHaveLength(1);

  await pill(page).click();
  await expect(popover(page)).toContainText('1 declined');
  await popover(page).getByRole('button', { name: 'Forget Declined' }).click();
  await expect(popover(page)).not.toContainText('declined');
  expect((await storedTab(page)).esDeclined ?? []).toHaveLength(0);
});

test('every other way in opens the same popover, about what it stands for', async ({ page }) => {
  await startAskBoard(page);

  // The command palette: about the selection, here nothing.
  await run(page, 'Ask for Suggestions');
  await expect(popover(page)).toContainText('About the board');
  await page.keyboard.press('Escape');
  await expect(pill(page)).toBeFocused();

  // A selected context's name: about that context.
  await contextName(page, 'Floor').click();
  const askFloor = page.getByRole('button', { name: 'Ask about candidate context: Floor' });
  await expect(askFloor).toBeVisible();
  await askFloor.click();
  await expect(popover(page)).toContainText('About “Floor”');
  expect(await topicNames(page)).toEqual(['Suggest Names', 'Sharpen the Wording']);
  await expect(popover(page).getByRole('button', { name: 'Arrange and Reorder' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The context is still selected: the pill and the command read the selection too, and a press on either leaves it.
  await pill(page).click();
  await expect(popover(page)).toContainText('About “Floor”');
  await page.keyboard.press('Escape');
  await run(page, 'Ask for Suggestions');
  await expect(popover(page)).toContainText('About “Floor”');
  await page.keyboard.press('Escape');

  // Two contexts selected: the merge offer asks about them as one.
  await contextName(page, 'Floor').click();
  await contextName(page, 'Pass').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: /^Ask about candidate context/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask about 2 contexts' }).click();
  await expect(popover(page)).toContainText('About 2 contexts');
  expect(await topicNames(page)).toEqual(['Name the Merge']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Keep them apart' }).click();

  // A workshop note's menu: about that note.
  await note(page, IDS.dishPlated).click({ button: 'right' });
  await page.getByRole('button', { name: 'Ask…', exact: true }).click();
  await expect(popover(page)).toContainText('About 1 note');
  expect(await topicNames(page)).toEqual(['Fill the Gaps', 'Sharpen the Wording']);
  await expect(topicsOf(page).first()).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
});

test('a deployment with no model shows two hands, and with lanes chosen still offers the board’s own fold; Arrange and Reorder needs no hand', async ({
  page,
}) => {
  await startAskBoard(page, { model: false });
  await pill(page).click();
  await expect(
    popover(page).getByRole('group', { name: 'Who answers' }).getByRole('radio'),
  ).toHaveCount(2);
  await expect(hand(page, /^Built-in/)).toHaveCount(0);
  await topic(page, 'Reorganise into Lanes').check();
  // The stepper starts at the lanes in use.
  const lanes = popover(page).getByRole('group', { name: 'Lanes', exact: true });
  await expect(lanes).toContainText('4');
  await lanes.getByRole('button', { name: 'Fewer lanes' }).click();
  await lanes.getByRole('button', { name: 'Fewer lanes' }).click();
  await expect(lanes).toContainText('2');
  await popover(page).getByRole('button', { name: 'Fold the Lanes' }).click();

  await expect(page.getByText('1 suggestion added', { exact: true })).toBeVisible();
  await expect(popover(page)).toHaveCount(0);
  await count(page, '1 suggestion').click();
  const row = corner(page).locator('[data-suggestion-row^="lane-plan:"]');
  await expect(row).toHaveAccessibleName('Lane plan: 2 lanes');
  await expect(row).toContainText('The board’s own fold, made without a model.');
  await expect(row).toContainText('Suggested by LiveDoc');
  expect((await storedTab(page)).elements.filter((el) => el.esLanePlan)).toHaveLength(1);
  await row.getByRole('button', { name: /^Dismiss suggestion: Lane plan/ }).click();

  // Arrange and Reorder is the board's own act: it closes the popover and previews the board arranged.
  await pill(page).click();
  await popover(page).getByRole('button', { name: 'Arrange and Reorder' }).click();
  await expect(popover(page)).toHaveCount(0);
  const bar = page.getByTestId('board-offer-bar');
  await expect(bar).toContainText('Arranged and reordered along the timeline');
  await bar.getByRole('button', { name: 'Put Back', exact: true }).click();
  await expect(bar).toHaveCount(0);
});

// Share roles (docs/specs/021-event-storming/asks.md "Share roles"): asking brings suggestions, which are an
// Editor's alone.
for (const role of ['participate', 'view'] as const)
  test(`someone who opens the board through a ${role} link sees no Ask pill and cannot ask`, async ({
    page,
    browser,
  }) => {
    await startAskBoard(page);
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    const headers = await pageOwnerHeaders(page, { 'Content-Type': 'application/json' });
    const code = await page.evaluate(
      async ({ base, headers, role }) => {
        const id = location.pathname.split('/').filter(Boolean).pop()!;
        const res = await fetch(`${base}/documents/${id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ role }),
        });
        return ((await res.json()) as { link: { code: string } }).link.code;
      },
      { base: apiBase, headers, role },
    );

    const guest = await freshDarkPage(browser);
    await guest.goto(`/document/shared?s=${code}`);
    // A visitor with no identity yet is greeted by the Join dialog.
    await guest.getByRole('button', { name: /^join$/i }).click();
    await note(guest, IDS.orderTaken).waitFor();
    await expect(guest.getByTestId('suggestions-panel')).toHaveCount(0);
    await expect(guest.locator('[data-ask-button]')).toHaveCount(0);
    await expect(guest.locator('[data-context-ask]')).toHaveCount(0);

    await guest.keyboard.press('ControlOrMeta+k');
    const search = guest.getByRole('dialog', { name: 'Search' });
    // The search answers (fitting the board is everyone's), and asking is not among its answers.
    await search.getByRole('combobox', { name: 'Search' }).fill('Fit to Screen');
    await expect(search.getByRole('option', { name: 'Fit to Screen', exact: true })).toBeVisible();
    await search.getByRole('combobox', { name: 'Search' }).fill('Ask for Suggestions');
    await expect(search.getByRole('option', { name: 'Ask for Suggestions' })).toHaveCount(0);
    await guest.context().close();
  });
