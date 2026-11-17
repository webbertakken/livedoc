import type { Locator, Page } from '@playwright/test';
import { expect, openStartBlank, seedTab, test } from './fixtures';
import { startReviewBoard } from './review-board';
import { CONTEXT_BOARD_IDS, startContextBoard } from './context-board';
import { startSuggestionBoard } from './suggestion-board';

// Escape backs out (docs/specs/004-interface-design/escape.md "The audit"): every transient state the audit names is
// left by one press of Escape, from where the keyboard stands after entering it, and the next press peels the next
// layer. What only a browser can answer: which of the page's many Escape listeners takes the key first.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const BOX = {
  id: 'box',
  type: 'shape',
  shape: 'rectangle',
  x: 320,
  y: 260,
  width: 140,
  height: 90,
  label: 'Box',
};

const box = (page: Page) => page.locator('[data-element-id="box"]').first();
const picker = (page: Page) => page.getByRole('button', { name: 'Selection mode' });
const expanded = (control: Locator) => expect(control).toHaveAttribute('aria-expanded', 'true');
const folded = (control: Locator) => expect(control).toHaveAttribute('aria-expanded', 'false');

async function blankWithBox(page: Page): Promise<void> {
  await openStartBlank(page);
  await seedTab(page, [BOX]);
}

// A press on the empty canvas: the keyboard on the board, as after a click away from everything.
async function clickEmptyCanvas(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 150);
}

async function currentTool(page: Page): Promise<string> {
  await picker(page).click();
  const chosen = page.getByRole('option', { selected: true });
  const name = (await chosen.textContent()) ?? '';
  await page.keyboard.press('Escape');
  await folded(picker(page));
  return name;
}

test('Escape closes each surface of a diagram tab, one press each', async ({ page }) => {
  test.setTimeout(90_000);
  await blankWithBox(page);
  // Each opener, and what it opens: gone after one Escape.
  const surfaces: [string, () => Promise<void>, () => Locator][] = [
    [
      'Search',
      () => page.getByRole('button', { name: 'Search', exact: true }).click(),
      () => page.getByRole('dialog', { name: 'Search' }),
    ],
    [
      'the tab list',
      () => page.getByRole('button', { name: /all tabs/ }).click(),
      () => page.getByRole('dialog', { name: 'Tabs' }),
    ],
    [
      'the tab menu',
      () => page.getByRole('button', { name: 'Tab menu' }).click(),
      () => page.getByRole('dialog', { name: 'Tab menu' }),
    ],
    [
      'the mode chip menu',
      () => page.getByRole('button', { name: /^Editor mode/ }).click(),
      () => page.getByRole('menu', { name: 'Editor mode' }),
    ],
    [
      'Tab style',
      () => page.getByRole('button', { name: 'Theme and canvas' }).click(),
      () => page.getByRole('dialog', { name: 'Tab style' }),
    ],
    [
      'Share',
      () => page.getByRole('button', { name: 'Share', exact: true }).click(),
      () => page.getByRole('dialog', { name: 'Share This Document' }),
    ],
    [
      'Settings',
      () => page.getByRole('button', { name: 'Application settings' }).click(),
      () => page.getByRole('dialog', { name: 'Settings' }),
    ],
    ['the selection-mode picker', () => picker(page).click(), () => page.getByRole('listbox')],
    [
      'the palette category',
      () => page.getByRole('button', { name: 'Palette category' }).click(),
      () => page.getByRole('listbox'),
    ],
    [
      'the element menu',
      () => box(page).click({ button: 'right' }),
      () => page.getByRole('dialog', { name: 'Element menu' }),
    ],
  ];
  for (const [name, open, surface] of surfaces) {
    await test.step(name, async () => {
      await open();
      await expect(surface()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(surface()).toHaveCount(0);
    });
  }
  // Trays and dock popovers that fold back to their buttons. A dock popover's code loads as it first opens: Escape
  // is pressed once it shows.
  const floating = page.locator('[data-floating-panel]:visible');
  for (const [name, docked] of [
    ['More Popular', false],
    ['Open Layers', true],
    ['Explorer', true],
  ] as const) {
    await test.step(name, async () => {
      const button = page.getByRole('button', { name, exact: true });
      const before = await floating.count();
      await button.click();
      await expanded(button);
      if (docked) await expect(floating).toHaveCount(before + 1);
      await page.keyboard.press('Escape');
      await folded(button);
    });
  }
});

test('Escape leaves each field of a diagram tab', async ({ page }) => {
  await blankWithBox(page);
  for (const name of ['Rename tab', 'Untitled document', 'Search elements']) {
    await test.step(name, async () => {
      await page.getByRole('button', { name, exact: true }).click();
      const field = page.locator('input:focus');
      await expect(field).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('input:focus')).toHaveCount(0);
    });
  }
  await test.step('a label being typed', async () => {
    await box(page).dblclick();
    const label = page.getByRole('textbox', { name: 'Edit text' });
    await expect(label).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(label).toHaveCount(0);
  });
});

test('Escape puts every canvas tool down to Select, then clears the selection, then leaves Zen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await blankWithBox(page);
  for (const tool of [
    'Hand',
    'Eraser',
    'Format',
    'Laser',
    'Spotlight',
    'Slide Deck',
    'Isometric',
  ]) {
    await test.step(tool, async () => {
      await picker(page).click();
      await page.getByRole('option', { name: new RegExp(`^${tool}`) }).click();
      await folded(picker(page));
      expect(await currentTool(page)).toMatch(new RegExp(`^${tool}`));
      await clickEmptyCanvas(page).catch(() => {});
      await page.keyboard.press('Escape');
      expect(await currentTool(page)).toMatch(/^Select/);
    });
  }
  await test.step('a pending draw-to-size', async () => {
    await page.getByRole('button', { name: 'Add Square' }).click();
    const banner = page.getByText(/Click to drop or drag to draw/);
    await expect(banner).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(banner).toHaveCount(0);
  });
  await test.step('one layer per press: the tool, then the selection', async () => {
    await box(page).click();
    const grips = page.locator('[data-selection-grips] > div > *');
    await expect(grips.first()).toBeAttached();
    await picker(page).click();
    await page.getByRole('option', { name: /^Hand/ }).click();
    await page.locator('[data-canvas-a11y-root]').focus();
    await page.keyboard.press('Escape');
    // Hand is put down; the selection stays for the next press.
    await expect(grips.first()).toBeAttached();
    expect(await currentTool(page)).toMatch(/^Select/);
    await page.locator('[data-canvas-a11y-root]').focus();
    await page.keyboard.press('Escape');
    await expect(grips).toHaveCount(0);
  });
  await test.step('one layer per press: the tool, then Zen', async () => {
    await page.keyboard.press('z');
    await expect(picker(page)).toBeHidden();
    await page.keyboard.press('k');
    await page.keyboard.press('Escape');
    // The laser is put down; Zen stays for the next press.
    await expect(picker(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(picker(page)).toBeVisible();
    expect(await currentTool(page)).toMatch(/^Select/);
  });
});

test('Escape lets a chosen term go from the board, then a rename’s preview first', async ({
  page,
}) => {
  await startReviewBoard(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Review' });
  await panel.getByRole('tab', { name: 'Language', exact: true }).click();
  const order = panel.locator('[data-review-term]').first().getByRole('button').first();
  const dimmed = page.locator('html[data-review-dim]');

  await order.click();
  await expect(dimmed).toHaveCount(1);
  // The keyboard on the board, away from the panel: the board is still dimmed until Escape.
  await clickEmptyCanvas(page);
  await expect(dimmed).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dimmed).toHaveCount(0);
  await expect(order).toHaveAttribute('aria-pressed', 'false');
  await expect(panel).toBeVisible();

  // A rename under way: its preview goes first, the term the press after.
  await order.click();
  await panel.getByRole('button', { name: 'Rename Term', exact: true }).click();
  const field = panel.getByRole('textbox', { name: /New term/i });
  await field.fill('item');
  await page.locator('[data-canvas-a11y-root]').focus();
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(dimmed).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dimmed).toHaveCount(0);

  // With the keyboard in the panel, Escape closes it.
  await panel.getByRole('tab', { name: 'Language', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('Escape folds the suggestions list and closes the Ask popover', async ({ page }) => {
  await startSuggestionBoard(page);
  const corner = page.getByTestId('suggestions-panel');
  const toggle = corner.getByRole('button', { name: /^\d+ suggestions?$/ });
  await toggle.click();
  await expanded(toggle);
  await corner.getByRole('listitem').first().focus();
  await page.keyboard.press('Escape');
  await folded(toggle);
  await expect(toggle).toBeFocused();

  const ask = page.getByRole('button', { name: 'Ask', exact: true });
  await ask.click();
  const popover = page.getByRole('dialog', { name: 'Ask for Suggestions' });
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

test('Escape leaves a candidate context’s rename, its selection and Draw Context’s pen', async ({
  page,
}) => {
  await startContextBoard(page);
  const name = page.locator(`[data-context-name-for="${CONTEXT_BOARD_IDS.ordering}"]`);
  await name.dblclick();
  const field = page.getByRole('textbox', { name: 'Candidate context name' });
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(name).toBeFocused();

  const outline = page.locator(
    `[data-testid="context-lines"] [data-candidate-context="${CONTEXT_BOARD_IDS.ordering}"] path`,
  );
  const dash = () => outline.first().getAttribute('stroke-dasharray');
  await name.click();
  await expect.poll(dash).toBeNull();
  await clickEmptyCanvas(page);
  await name.click();
  await page.locator('[data-canvas-a11y-root]').focus();
  await page.keyboard.press('Escape');
  await expect.poll(dash).not.toBeNull();

  await page.getByRole('button', { name: 'Draw Context' }).click();
  await expect(page.locator('[data-context-pen]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-context-pen]')).toHaveCount(0);
});
