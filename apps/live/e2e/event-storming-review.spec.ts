import type { Locator, Page } from '@playwright/test';
import { freshDarkPage } from './audit-screens';
import { expect, pageOwnerHeaders, settledBox, test } from './fixtures';
import { REVIEW_BOARD_ANSWER, REVIEW_BOARD_IDS as IDS, startReviewBoard } from './review-board';
import { storedBoardTab } from './suggestion-board';

// Board structure and the Review panel (docs/specs/021-event-storming/board-structure.md, board-review.md,
// board-language.md "The Language tab"), in a real browser on the seeded kitchen. What only a browser can answer:
// whether the pill stands in the corner and the card under it, whether the keyboard goes where it should (into the
// panel, back to the pill, into an answer field once the menu that opened it has closed, on to the check), whether a
// row brings its notes into view and rings them, whether each write is one step the server holds and one Undo takes
// back, and whether someone who may only read sees all of it and can change none of it.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

type Stored = { id: string; type: string; label?: string; esPivotal?: true; esAnswer?: string };

const stored = async (page: Page) => (await storedBoardTab<{ elements: Stored[] }>(page)).elements;
const storedNote = async (page: Page, id: string) =>
  (await stored(page)).find((el) => el.id === id);

const note = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const corner = (page: Page) => page.getByTestId('suggestions-panel');
const pill = (page: Page) => page.getByRole('button', { name: 'Review', exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Review' });
const tab = (page: Page, name: string) => panel(page).getByRole('tab', { name, exact: true });
const readiness = (page: Page) => panel(page).getByRole('status');
const ring = (page: Page, id: string) => page.locator(`[data-review-ring="${id}"]`);
const ringedIds = (page: Page) =>
  page
    .locator('[data-review-ring]')
    .evaluateAll((rings) => rings.map((r) => r.getAttribute('data-review-ring')).sort());
const tape = (page: Page, id: string) => page.locator(`[data-pivotal-tape="${id}"]`);
const check = (page: Page, id: string) => page.locator(`[data-answer-mark="${id}"]`);
const answerField = (page: Page) => page.getByRole('textbox', { name: 'Answer', exact: true });
const caption = (page: Page) => page.locator('[data-answer-caption]');
const callout = (page: Page) => page.locator('[data-note-callout]');
const menu = (page: Page) => page.getByRole('dialog', { name: 'Element menu' });
const boardIds = (page: Page) =>
  page
    .locator('[data-element-id]')
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.getAttribute('data-element-id')!))]);

async function openMenu(page: Page, id: string): Promise<Locator> {
  await note(page, id).click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  return menu(page);
}

async function openPanel(page: Page, name = 'Check'): Promise<Locator> {
  await pill(page).click();
  await expect(panel(page)).toBeVisible();
  if (name !== 'Check') await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  return panel(page);
}

// How far the box under a note (the answer field, the caption) stands from where it belongs, px: a gap under its
// note, moved no further than keeps it a margin inside the window.
async function offItsNote(page: Page, id: string): Promise<number> {
  const at = await note(page, id).boundingBox();
  const box = await callout(page).boundingBox();
  if (!at || !box) return Infinity;
  const { width, height } = page.viewportSize()!;
  const within = (value: number, most: number) => Math.max(8, Math.min(value, most));
  const left = within(at.x, width - 8 - box.width);
  const top = within(at.y + at.height + 8, height - 8 - box.height);
  return Math.max(Math.abs(box.x - left), Math.abs(box.y - top));
}

// How much of a box stands under the Review card, px across. Both are read in one look, as the board may glide.
const underTheCard = (page: Page, selector: string): Promise<number> =>
  page.evaluate((what) => {
    const box = document.querySelector(what)?.getBoundingClientRect();
    const card = document.querySelector('[data-testid="review-panel"]')?.getBoundingClientRect();
    if (!box || !card) return Infinity;
    const across = Math.min(box.right, card.right) - Math.max(box.left, card.left);
    const down = Math.min(box.bottom, card.bottom) - Math.max(box.top, card.top);
    return across > 0 && down > 0 ? across : 0;
  }, selector);

// How far a ring is from standing six px round its note, px. Both are read in one look: the row that rings a
// note may still be gliding it into view, and two looks would find the board in two places.
const ringOffItsNote = (page: Page, id: string): Promise<number> =>
  page.evaluate((noteId) => {
    const around = document
      .querySelector(`[data-review-ring="${noteId}"]`)
      ?.getBoundingClientRect();
    const inside = document.querySelector(`[data-element-id="${noteId}"]`)?.getBoundingClientRect();
    if (!around || !inside) return Infinity;
    return Math.max(
      Math.abs(inside.left - around.left - 6),
      Math.abs(around.right - inside.right - 6),
    );
  }, id);

// Zooms in on the timeline's start, so its far end stands outside the window: what a row brings into view is
// then seen to arrive.
async function zoomInOnStart(page: Page): Promise<void> {
  const farEnd = note(page, IDS.tableCleared);
  const outside = () =>
    farEnd.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.left > window.innerWidth || box.right < 0;
    });
  // Order taken: no context's name stands over it.
  await note(page, IDS.orderTaken).hover();
  await page.keyboard.down('Control');
  for (let i = 0; i < 12 && !(await outside()); i += 1) await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await expect(farEnd).not.toBeInViewport();
}

// What the page said went wrong, when a test fails: the canvas's error boundary keeps it off the page.
test.beforeEach(({ pageErrors }) => {
  expect(pageErrors).toEqual([]);
});
test.afterEach(({ pageErrors }, info) => {
  if (info.status !== info.expectedStatus && pageErrors.length > 0)
    console.log(`PAGE ERRORS in "${info.title}":\n${pageErrors.join('\n')}`);
});

const READY = '5 events · 3 gaps · 1 open hotspot · 3 events outside a context';

test('the Review pill stands in the corner and opens the panel as a card under it', async ({
  page,
}) => {
  await startReviewBoard(page);
  // Last in the corner, after Ask: one home for asking, what comes back and looking the board over.
  await expect(corner(page).getByRole('button')).toHaveText(['Ask', 'Review']);
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toHaveCount(0);

  await pill(page).click();
  await expect(pill(page)).toHaveAttribute('aria-expanded', 'true');
  const card = (await panel(page).boundingBox())!;
  const home = (await corner(page).boundingBox())!;
  expect(card.width).toBe(360);
  // Under the corner, their right edges in line, half a rem between them.
  expect(Math.abs(card.x + card.width - (home.x + home.width))).toBeLessThan(1);
  expect(card.y - (home.y + home.height)).toBeGreaterThanOrEqual(6);
  expect(card.y - (home.y + home.height)).toBeLessThanOrEqual(10);
  // Check the first time, the readiness line at its head, and the keyboard in the panel.
  await expect(tab(page, 'Check')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Check')).toBeFocused();
  await expect(readiness(page)).toHaveText(READY);

  // The arrow keys walk the tabs; Escape closes the panel and gives the keyboard back to the pill.
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Language')).toBeFocused();
  await expect(tab(page, 'Language')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(page, 'Story')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(pill(page)).toBeFocused();

  // The tab last open is remembered on this device.
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Story')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Story')).toBeFocused();

  // One thing open in the corner: an ask closes the panel, and the panel closes the ask.
  const ask = page.getByRole('dialog', { name: 'Ask for Suggestions' });
  await corner(page).getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(ask).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await pill(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(ask).toHaveCount(0);
  // Pressed again, the pill closes it.
  await pill(page).click();
  await expect(panel(page)).toHaveCount(0);
});

test('Check lists the gaps by level, rings what a row names, and Add lands a note as one step', async ({
  page,
}) => {
  await startReviewBoard(page);
  const review = await openPanel(page);
  await expect(review.getByRole('heading')).toHaveText([
    'The story has a hole',
    'The grammar slipped',
    'Left open',
  ]);
  // With Table cleared far right of the window, pointing at its row brings it into view and rings it.
  await zoomInOnStart(page);
  const hole = review.locator('[data-review-gap="event_without_cause"]');
  await expect(hole).toContainText('Table cleared');
  await hole.hover();
  await expect(note(page, IDS.tableCleared)).toBeInViewport();
  await expect(ring(page, IDS.tableCleared)).toBeVisible();
  // The ring stands round its note, six px off it, at screen size.
  await expect.poll(() => ringOffItsNote(page, IDS.tableCleared)).toBeLessThan(0.5);
  // Nothing is drawn on a note because of a gap: the ring goes with the pointer.
  await tab(page, 'Check').hover();
  await expect(page.locator('[data-review-ring]')).toHaveCount(0);

  // Add lands a blank command before the event and opens it for typing.
  const before = await boardIds(page);
  await review.getByRole('button', { name: 'Add a command before Table cleared' }).click();
  await expect.poll(async () => (await boardIds(page)).length).toBe(before.length + 1);
  const added = (await boardIds(page)).find((id) => !before.includes(id))!;
  await page.keyboard.type('Clear table');
  await expect(note(page, added)).toContainText('Clear table');
  // Both boxes in one look: the row's reveal may still glide the board clear of the card.
  await expect
    .poll(() =>
      page.evaluate(
        ([event, command]) => {
          const box = (id: string) =>
            document.querySelector(`[data-element-id="${id}"]`)!.getBoundingClientRect();
          return box(event!).left - box(command!).right;
        },
        [IDS.tableCleared, added],
      ),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  // The panel follows the board: the event has a cause now, and the new command wants someone to issue it.
  await expect(hole).toHaveCount(0);
  await expect(review.locator('[data-review-gap="command_without_trigger"]')).toHaveCount(2);
  expect((await storedNote(page, added))?.label).toBe('Clear table');

  // The typing is one step and the note another: two Undos take it all back.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await boardIds(page)).length).toBe(before.length);
  await expect(hole).toHaveCount(1);
  expect(await storedNote(page, added)).toBeUndefined();
});

test('Answer on a Check row opens the hotspot’s answer; Enter keeps it and the check takes the keyboard', async ({
  page,
}) => {
  await startReviewBoard(page);
  const review = await openPanel(page);
  await zoomInOnStart(page);
  await expect(note(page, IDS.sentBack)).not.toBeInViewport();
  await review.getByRole('button', { name: 'Answer: What if an order is sent back?' }).click();
  await expect(answerField(page)).toBeFocused();
  await expect(note(page, IDS.sentBack)).toBeInViewport();
  // The field opened while its note was still outside the window; it stands under the note once that has arrived.
  await expect.poll(() => offItsNote(page, IDS.sentBack)).toBeLessThan(1);
  // It lands in the part of the board the card leaves free, the field with it.
  await expect.poll(() => underTheCard(page, `[data-element-id="${IDS.sentBack}"]`)).toBe(0);
  await expect.poll(() => underTheCard(page, '[data-note-callout]')).toBe(0);
  await page.keyboard.type('Remake it; the pass decides.');
  await page.keyboard.press('Enter');
  await expect(answerField(page)).toHaveCount(0);

  // The question is a decision now: it wears the check, which says the answer and holds the keyboard.
  await expect(check(page, IDS.sentBack)).toBeFocused();
  await expect(check(page, IDS.sentBack)).toHaveAccessibleName(
    'Answered: Remake it; the pass decides.',
  );
  await expect(caption(page)).toContainText('Remake it; the pass decides.');
  await expect(readiness(page)).toHaveText('5 events · 3 gaps · 3 events outside a context');
  await expect(review.locator('[data-review-gap="open_hotspot"]')).toHaveCount(0);
  expect((await storedNote(page, IDS.sentBack))?.esAnswer).toBe('Remake it; the pass decides.');

  // One step: one Undo reopens the question.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(check(page, IDS.sentBack)).toHaveCount(0);
  await expect(readiness(page)).toHaveText(READY);
  expect((await storedNote(page, IDS.sentBack))?.esAnswer).toBeUndefined();
});

test('Language rings a chosen term’s notes and dims the rest; Rename Term previews, then renames in one step', async ({
  page,
}) => {
  await startReviewBoard(page);
  const review = await openPanel(page, 'Language');
  const order = review.locator('[data-review-term]').first();
  await expect(order).toContainText(/order/i);
  await expect(order).toContainText('5 notes');
  await expect(order).toContainText('2 contexts');

  await order.getByRole('button', { name: /^order/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-review-dim', '');
  expect(await ringedIds(page)).toEqual(
    [IDS.takeOrder, IDS.orderTaken, IDS.plateOrder, IDS.orderPlated, IDS.sentBack].sort(),
  );
  const dimmed = (id: string) => note(page, id).evaluate((el) => getComputedStyle(el).filter);
  await expect.poll(() => dimmed(IDS.waiter)).toBe('opacity(0.35)');
  expect(await dimmed(IDS.takeOrder)).toBe('none');

  // Typing a new term draws the board as the rename would leave it; nothing is written yet.
  await review.getByRole('button', { name: 'Rename Term', exact: true }).click();
  const field = review.getByRole('textbox', { name: /New term for order/i });
  await expect(field).toBeFocused();
  await field.fill('item');
  await expect(note(page, IDS.takeOrder)).toContainText('Take item');
  await expect(note(page, IDS.orderTaken)).toContainText('Item taken');
  expect((await storedNote(page, IDS.takeOrder))?.label).toBe('Take order');

  // Escape leaves the field and the board as it was; the term stays chosen, and the panel open.
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(note(page, IDS.takeOrder)).toContainText('Take order');
  await expect(page.locator('html')).toHaveAttribute('data-review-dim', '');
  // The keyboard is on Rename Term; the next Escape lets the term go, the keyboard on the term and the board whole.
  await expect(review.getByRole('button', { name: 'Rename Term', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveAttribute('data-review-dim', '');
  expect(await dimmed(IDS.waiter)).toBe('none');
  await expect(order.getByRole('button', { name: /^order/i })).toBeFocused();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-review-dim', '');

  // Rename keeps it: every note that holds the term, in one step.
  await review.getByRole('button', { name: 'Rename Term', exact: true }).click();
  await review.getByRole('textbox', { name: /New term for order/i }).fill('item');
  await page.keyboard.press('Enter');
  await expect(note(page, IDS.orderPlated)).toContainText('Item plated');
  // The keyboard stays in the list, on the row where the renamed term stands.
  await expect(review.getByRole('button', { name: /^item/i })).toBeFocused();
  const labels = async () => {
    const all = await stored(page);
    return [IDS.takeOrder, IDS.orderTaken, IDS.plateOrder, IDS.orderPlated, IDS.sentBack].map(
      (id) => all.find((el) => el.id === id)?.label,
    );
  };
  expect(await labels()).toEqual([
    'Take item',
    'Item taken',
    'Plate item',
    'Item plated',
    'What if an item is sent back?',
  ]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note(page, IDS.orderPlated)).toContainText('Order plated');
  expect(await labels()).toEqual([
    'Take order',
    'Order taken',
    'Plate order',
    'Order plated',
    'What if an order is sent back?',
  ]);
});

test('Story tells the timeline step by step and walks it by keyboard, ringing each step', async ({
  page,
}) => {
  await startReviewBoard(page);
  const review = await openPanel(page, 'Story');
  const story = review.getByRole('listbox', { name: 'The story, step by step' });
  const steps = story.getByRole('option');
  await expect(steps).toHaveCount(5);
  await expect(steps.first()).toContainText('Waiter: Take order');
  await expect(steps.first()).toContainText('Order taken closes a phase');
  // An answered question is told with its answer.
  await expect(steps.nth(1)).toContainText(REVIEW_BOARD_ANSWER);
  await expect(review.getByText('5 steps')).toBeVisible();
  await expect(page.locator('[data-review-ring]')).toHaveCount(0);

  await story.focus();
  await page.keyboard.press('ArrowDown');
  await expect(steps.first()).toHaveAttribute('aria-selected', 'true');
  await expect(review.getByText('Step 1 of 5')).toBeVisible();
  await expect(ring(page, IDS.orderTaken)).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(steps.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await ringedIds(page)).toEqual(
    [IDS.cook, IDS.plateOrder, IDS.orderPlated, IDS.whoCalls].sort(),
  );
  // With the last step far right of the window, walking to it brings it into view.
  await zoomInOnStart(page);
  await story.focus();
  await page.keyboard.press('End');
  await expect(steps.last()).toHaveAttribute('aria-selected', 'true');
  await expect(note(page, IDS.tableCleared)).toBeInViewport();
  await expect(review.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await review.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(review.getByText('Step 4 of 5')).toBeVisible();
  await expect(ring(page, IDS.guestPays)).toBeVisible();
  await story.focus();
  await page.keyboard.press('Home');
  await expect(steps.first()).toHaveAttribute('aria-selected', 'true');
});

test('a domain event is marked pivotal from its menu and wears the tape; one Undo each way', async ({
  page,
}) => {
  await startReviewBoard(page);
  // The seeded pivotal event wears its tape, centred on the event and behind it.
  const centre = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    return box.x + box.width / 2;
  };
  await expect(tape(page, IDS.orderTaken)).toHaveCount(1);
  await expect
    .poll(async () =>
      Math.abs(
        (await centre(tape(page, IDS.orderTaken))) - (await centre(note(page, IDS.orderTaken))),
      ),
    )
    .toBeLessThan(0.5);
  await expect(
    page.locator('[data-canvas-a11y-root]').getByRole('img', { name: /Order taken.*, pivotal$/ }),
  ).toHaveCount(1);

  // Only a domain event is offered the mark.
  await expect(
    (await openMenu(page, IDS.plateOrder)).getByRole('button', { name: /Pivotal/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  await (
    await openMenu(page, IDS.orderPlated)
  )
    .getByRole('button', { name: 'Mark as Pivotal', exact: true })
    .click();
  await expect(menu(page)).toHaveCount(0);
  await expect(tape(page, IDS.orderPlated)).toHaveCount(1);
  expect((await storedNote(page, IDS.orderPlated))?.esPivotal).toBe(true);
  // A phase more in the story.
  await openPanel(page, 'Story');
  await expect(panel(page).getByText('Order plated closes a phase')).toBeVisible();
  await page.keyboard.press('Escape');

  await (
    await openMenu(page, IDS.orderPlated)
  )
    .getByRole('button', { name: 'Unmark Pivotal', exact: true })
    .click();
  await expect(tape(page, IDS.orderPlated)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tape(page, IDS.orderPlated)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tape(page, IDS.orderPlated)).toHaveCount(0);
  expect((await storedNote(page, IDS.orderPlated))?.esPivotal).toBeUndefined();
});

test('a hotspot is answered from its menu: the field takes the keyboard, Enter and leaving keep, Escape leaves', async ({
  page,
}) => {
  await startReviewBoard(page);
  // Only a hotspot is offered an answer.
  await expect(
    (await openMenu(page, IDS.orderPlated)).getByRole('button', { name: /Answer/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The field opens under the note and keeps the keyboard once the menu has closed.
  const sentBack = () => openMenu(page, IDS.sentBack);
  await (await sentBack()).getByRole('button', { name: 'Answer…', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(answerField(page)).toBeFocused();
  const fieldBox = (await page.locator('[data-answer-field]').boundingBox())!;
  const noteBox = (await note(page, IDS.sentBack).boundingBox())!;
  expect(fieldBox.y).toBeGreaterThanOrEqual(noteBox.y + noteBox.height);
  // Its layout width, exactly: on screen it is counter-scaled against the board's zoom (scale(1 / zoom)), which the
  // browser draws in float32, so its box carries rounding noise at most zooms.
  expect(
    await page
      .locator('[data-answer-field]')
      .evaluate((field) => (field as HTMLElement).offsetWidth),
  ).toBe(260);

  // Escape leaves the question open.
  await page.keyboard.type('Never mind');
  await page.keyboard.press('Escape');
  await expect(answerField(page)).toHaveCount(0);
  await expect(check(page, IDS.sentBack)).toHaveCount(0);

  // Enter keeps the answer, whitespace tidied, and the check takes the keyboard.
  await (await sentBack()).getByRole('button', { name: 'Answer…', exact: true }).click();
  await page.keyboard.type('  Remake it.  ');
  await page.keyboard.press('Enter');
  await expect(check(page, IDS.sentBack)).toBeFocused();
  await expect(check(page, IDS.sentBack)).toHaveAccessibleName('Answered: Remake it.');
  expect((await storedNote(page, IDS.sentBack))?.esAnswer).toBe('Remake it.');

  // Pressing the check opens the answer again; leaving the field keeps what it holds.
  await check(page, IDS.sentBack).click();
  await expect(answerField(page)).toHaveValue('Remake it.');
  await answerField(page).fill('Remake it, on the house.');
  await note(page, IDS.runner).click();
  await expect(answerField(page)).toHaveCount(0);
  await expect(check(page, IDS.sentBack)).toHaveAccessibleName(
    'Answered: Remake it, on the house.',
  );

  // The menu says Edit Answer… now; an emptied answer reopens the question.
  await (await sentBack()).getByRole('button', { name: 'Edit Answer…', exact: true }).click();
  await expect(answerField(page)).toBeFocused();
  await answerField(page).fill('');
  await page.keyboard.press('Enter');
  await expect(check(page, IDS.sentBack)).toHaveCount(0);
  expect((await storedNote(page, IDS.sentBack))?.esAnswer).toBeUndefined();
});

test('an answered hotspot shows its answer as a caption when its check is pointed at or focused', async ({
  page,
}) => {
  await startReviewBoard(page);
  const mark = check(page, IDS.whoCalls);
  await expect(mark).toHaveAccessibleName(`Answered: ${REVIEW_BOARD_ANSWER}`);
  // On the note's top right corner, a 28 px target.
  const hotspot = await settledBox(note(page, IDS.whoCalls));
  const target = await settledBox(mark);
  // Its layout width, exactly: counter-scaled against the board's zoom in float32 on screen, as the answer field.
  expect(await mark.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(28);
  expect(Math.abs(target.x + target.width / 2 - (hotspot.x + hotspot.width - 4))).toBeLessThan(1);
  expect(Math.abs(target.y + target.height / 2 - (hotspot.y + 4))).toBeLessThan(1);

  await expect(caption(page)).toHaveCount(0);
  await mark.hover();
  await expect(caption(page)).toContainText(REVIEW_BOARD_ANSWER);
  // The caption stands under the note, inside the window.
  const said = (await caption(page).boundingBox())!;
  expect(said.y).toBeGreaterThanOrEqual(hotspot.y + hotspot.height);
  expect(said.x).toBeGreaterThanOrEqual(0);
  await note(page, IDS.cook).hover();
  await expect(caption(page)).toHaveCount(0);
  await mark.focus();
  await expect(caption(page)).toContainText(REVIEW_BOARD_ANSWER);
});

test('a caption whose note stands at the window’s edge is moved inside the window, on a zoomed board', async ({
  page,
  pageErrors,
}) => {
  await startReviewBoard(page);
  const hotspot = note(page, IDS.whoCalls);
  const { width, height } = page.viewportSize()!;
  // Zoomed a little, so the board is measured through a scale (no position on it is a whole number of pixels)
  // and the note stays narrower than its caption.
  await note(page, IDS.orderTaken).hover();
  await page.keyboard.down('Control');
  for (let i = 0; i < 24 && (await settledBox(hotspot)).width < 150; i += 1)
    await page.mouse.wheel(0, -40);
  await page.keyboard.up('Control');
  expect((await settledBox(hotspot)).width).toBeLessThan(240);
  // The hotspot's right edge a little inside the window's: its caption, 260 px wide, would run off the page.
  for (let i = 0; i < 4; i += 1) {
    const box = await settledBox(hotspot);
    const off = box.x + box.width - (width - 24);
    if (Math.abs(off) < 2) break;
    await page.mouse.wheel(off, 0);
  }
  const stands = await settledBox(hotspot);
  expect(Math.abs(stands.x + stands.width - (width - 24))).toBeLessThan(2);

  await check(page, IDS.whoCalls).focus();
  await expect(caption(page)).toContainText(REVIEW_BOARD_ANSWER);
  const said = await settledBox(caption(page));
  expect(said.x).toBeGreaterThanOrEqual(0);
  expect(said.x + said.width).toBeLessThanOrEqual(width);
  expect(said.y + said.height).toBeLessThanOrEqual(height);
  // It was moved, as far as keeps it a margin inside the window and no further.
  expect(said.x).toBeLessThan(stands.x);
  expect(await offItsNote(page, IDS.whoCalls)).toBeLessThan(1);

  // Panned away from the edge, where it fits unmoved, it stands under its note again.
  await page.mouse.wheel(420, 0);
  await expect
    .poll(async () => (await hotspot.boundingBox())!.x + said.width)
    .toBeLessThan(width - 8);
  await expect.poll(() => offItsNote(page, IDS.whoCalls)).toBeLessThan(1);
  await expect(page.getByText('Something went wrong in the canvas.')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('Name This Lane adds a name left of the wall: a blank one left goes, a typed one is the lane’s name', async ({
  page,
}) => {
  await startReviewBoard(page);
  const before = await boardIds(page);
  // The policy's lane has no name yet; the events' lane has one.
  await expect(
    (await openMenu(page, IDS.orderTaken)).getByRole('button', { name: 'Rename This Lane' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // A blank name left as it is leaves nothing behind.
  const typing = page.locator('[contenteditable="true"]');
  const nameThisLane = async () => {
    const row = (await openMenu(page, IDS.fireTicket)).getByRole('button', {
      name: 'Name This Lane',
      exact: true,
    });
    await row.click();
    // The name is open for typing, its own menu beside it, as any text being typed has.
    await expect(typing).toBeFocused();
    await expect(menu(page).getByRole('button', { name: /This Lane/ })).toHaveCount(0);
  };
  await nameThisLane();
  expect((await boardIds(page)).length).toBe(before.length + 1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await boardIds(page)).length).toBe(before.length);
  await expect(menu(page)).toHaveCount(0);

  // A typed one stands left of the wall on the note's lane, and is read as the lane's name.
  await nameThisLane();
  await page.keyboard.type('Policies');
  await page.keyboard.press('Escape');
  const added = (await boardIds(page)).find((id) => !before.includes(id))!;
  await expect(note(page, added)).toContainText('Policies');
  const name = (await note(page, added).boundingBox())!;
  const wall = (await note(page, IDS.orderTaken).boundingBox())!;
  const lane = (await note(page, IDS.fireTicket).boundingBox())!;
  expect(name.x + name.width).toBeLessThanOrEqual(wall.x);
  expect(Math.abs(name.y + name.height / 2 - (lane.y + lane.height / 2))).toBeLessThan(
    lane.height / 2,
  );
  expect((await storedNote(page, added))?.type).toBe('text');
  await expect(
    (await openMenu(page, IDS.fireTicket)).getByRole('button', { name: 'Rename This Lane' }),
  ).toBeVisible();

  // On a named lane the row opens that name for typing.
  await menu(page).getByRole('button', { name: 'Rename This Lane', exact: true }).click();
  await expect(typing).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Rules');
  await page.keyboard.press('Escape');
  await expect(note(page, added)).toContainText('Rules');
  expect((await boardIds(page)).length).toBe(before.length + 1);
});

test('the export dialog says how ready the board is', async ({ page }) => {
  await startReviewBoard(page);
  await page.getByRole('button', { name: 'Tab menu' }).click();
  await page
    .getByRole('dialog', { name: 'Tab menu' })
    .getByRole('button', { name: 'Export', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Export Tab' });
  await dialog.getByRole('button', { name: /^Domain Model/ }).click();
  await expect(dialog.locator('[data-readiness]')).toHaveText(READY);
  // It informs and never blocks.
  await expect(dialog.getByRole('button', { name: 'Export .zip' })).toBeEnabled();
});

test('the Review Board command opens the panel', async ({ page }) => {
  await startReviewBoard(page);
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog', { name: 'Search' });
  await search.getByRole('combobox', { name: 'Search' }).fill('Review Board');
  await search.getByRole('option', { name: 'Review Board', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(tab(page, 'Check')).toBeFocused();
});

// What the rings and the check are read against (WCAG 2.2 "Non-text contrast": 3:1 or more).
function luminance([r, g, b]: number[]): number {
  const [x, y, z] = [r!, g!, b!].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
}
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi! + 0.05) / (lo! + 0.05);
};
// A computed colour as sRGB bytes, whatever notation the browser answers in.
const rgbOf = (target: Locator, property: string) =>
  target.evaluate((el, prop) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).getPropertyValue(prop);
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, property);

for (const scheme of ['dark', 'light'] as const)
  test(`the rings and the check read against the ${scheme} canvas`, async ({ page }) => {
    await page.addInitScript((mode) => localStorage.setItem('livedoc:v2:ui-mode', mode), scheme);
    await page.emulateMedia({ colorScheme: scheme });
    await startReviewBoard(page);
    const paper = await rgbOf(page.locator('[data-canvas-a11y-root]'), '--lvd-canvas-paper');
    await openPanel(page, 'Story');
    await panel(page).getByRole('option').nth(1).click();
    const ringInk = await rgbOf(ring(page, IDS.orderPlated), 'border-top-color');
    expect(contrast(ringInk, paper)).toBeGreaterThanOrEqual(3);
    // The check is read by its glyph: white on the disc. The disc wears a ring of the canvas's paper, so that is
    // what it is seen against on a note's edge.
    const disc = check(page, IDS.whoCalls).locator('span').first();
    const discInk = await rgbOf(disc, 'background-color');
    expect(contrast([255, 255, 255], discInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(discInk, paper)).toBeGreaterThanOrEqual(3);
  });

// Share roles (docs/specs/021-event-storming/board-review.md, board-structure.md "Share roles"): everyone on the
// board reads the panel and sees the tape, the checks and the answers; marking, answering, naming, Add and Rename
// Term are an Editor's.
for (const role of ['participate', 'view'] as const)
  test(`someone who opens the board through a ${role} link reads the review and changes nothing`, async ({
    page,
    browser,
  }) => {
    await startReviewBoard(page);
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
    await guest.getByRole('button', { name: /^join$/i }).click();
    await note(guest, IDS.orderTaken).waitFor();
    // The structure is everyone's to see.
    await expect(tape(guest, IDS.orderTaken)).toHaveCount(1);
    await expect(check(guest, IDS.whoCalls)).toHaveAccessibleName(
      `Answered: ${REVIEW_BOARD_ANSWER}`,
    );
    // The check shows its answer and opens nothing: an image, with nothing to press.
    await expect(check(guest, IDS.whoCalls)).toHaveRole('img');
    await check(guest, IDS.whoCalls).hover();
    await expect(caption(guest)).toContainText(REVIEW_BOARD_ANSWER);
    await check(guest, IDS.whoCalls).click();
    await expect(answerField(guest)).toHaveCount(0);

    // No suggestions corner for this session: the Review pill holds a corner of its own, where that one stands.
    await expect(guest.getByTestId('suggestions-panel')).toHaveCount(0);
    const own = guest.getByTestId('review-corner');
    await expect(own.getByRole('button')).toHaveText(['Review']);
    const home = (await own.boundingBox())!;
    expect(Math.round(home.y)).toBe(64);
    expect(Math.round(guest.viewportSize()!.width - (home.x + home.width))).toBe(12);

    // All three tabs read; nothing to write with.
    const review = await openPanel(guest);
    await expect(readiness(guest)).toHaveText(READY);
    await expect(review.locator('[data-review-gap]')).toHaveCount(7);
    await expect(review.getByRole('button', { name: /^Add / })).toHaveCount(0);
    await expect(review.getByRole('button', { name: /^Answer/ })).toHaveCount(0);
    await review.locator('[data-review-gap="event_without_cause"]').hover();
    await expect(ring(guest, IDS.tableCleared)).toBeVisible();
    await tab(guest, 'Language').click();
    await review.getByRole('button', { name: /^order/i }).click();
    await expect(guest.locator('html')).toHaveAttribute('data-review-dim', '');
    await expect(review.getByRole('button', { name: 'Rename Term' })).toHaveCount(0);
    await tab(guest, 'Story').click();
    await review.getByRole('option').nth(1).click();
    await expect(ring(guest, IDS.orderPlated)).toBeVisible();
    await guest.keyboard.press('Escape');
    await expect(panel(guest)).toHaveCount(0);

    // A note's menu, where this session has one, offers nothing of the board's structure.
    await note(guest, IDS.orderPlated).click({ button: 'right' });
    await expect(guest.getByRole('button', { name: /Pivotal|This Lane|Answer…/ })).toHaveCount(0);
    await guest.keyboard.press('Escape');

    // The search offers the review to everyone.
    await guest.keyboard.press('ControlOrMeta+k');
    const search = guest.getByRole('dialog', { name: 'Search' });
    await search.getByRole('combobox', { name: 'Search' }).fill('Review Board');
    await expect(search.getByRole('option', { name: 'Review Board', exact: true })).toBeVisible();
    await guest.context().close();
  });
