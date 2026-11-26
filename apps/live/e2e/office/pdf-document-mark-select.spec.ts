import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Changing a mark end to end (docs/specs/035-pdf-documents/marks.md "Changing a mark", "Keyboard and accessibility";
// keyboard-shortcuts.md "Selections, marks and comments": move and delete the selected mark): a press selects a mark
// and outlines it, a drag moves it, arrow keys move it, ⇧ adds a mark, Delete deletes them, each one step of undo.

/** A drag across page one between points given as fractions of its box. */
async function drag(page: Page, first: Locator, from: [number, number], to: [number, number]) {
  const box = (await first.boundingBox())!;
  const point = ([x, y]: [number, number]) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  await page.mouse.move(...point(to), { steps: 6 });
  await page.mouse.up();
}

/** Where a mark's left edge is on screen, a quarter of the way down: on its line, between its handles. */
async function leftEdge(mark: Locator): Promise<[number, number]> {
  const box = (await mark.boundingBox())!;
  return [box.x + 1, box.y + box.height / 4];
}

test('a mark made here is selected, moved by a drag and the arrow keys, and deleted', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Marks.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const outlines = page.locator(`${PAGE_ONE} [data-pdf-mark-outline]`);

  // A rectangle and an arrow, then Select (V).
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.5, 0.15], [0.75, 0.25]);
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Arrow'])).click();
  await drag(page, first, [0.15, 0.32], [0.4, 0.32]);
  await expect(kind('rectangle')).toHaveCount(1);
  await expect(kind('arrow')).toHaveCount(1);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  await expect(page.locator('[data-pdf-tool]')).toHaveAttribute('data-pdf-tool', 'select');

  // A press on the rectangle's line selects it: outlined, its control pressed and holding the keys.
  const rectangle = page.getByRole('button', { name: /^Rectangle by / });
  await page.mouse.click(...(await leftEdge(kind('rectangle'))));
  await expect(outlines).toHaveCount(1);
  await expect(rectangle).toHaveAttribute('aria-pressed', 'true');
  await expect(rectangle).toBeFocused();

  // A drag from it moves it, one step of undo.
  const before = (await kind('rectangle').boundingBox())!;
  const [x, y] = await leftEdge(kind('rectangle'));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y + 40, { steps: 8 });
  await page.mouse.up();
  const dragged = (await kind('rectangle').boundingBox())!;
  expect(dragged.x).toBeCloseTo(before.x - 60, -1);
  expect(dragged.y).toBeCloseTo(before.y + 40, -1);

  // ⇧ with an arrow key moves it 10 points the way it points.
  await page.keyboard.press('Shift+ArrowRight');
  const nudged = (await kind('rectangle').boundingBox())!;
  expect(nudged.x).toBeGreaterThan(dragged.x + 5);
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => (await kind('rectangle').boundingBox())!.x)
    .toBeCloseTo(dragged.x, 0);

  // ⇧ with a press on the arrow adds it; Delete deletes both as one step; undo brings both back.
  await page.keyboard.down('Shift');
  await page.mouse.click(...(await leftEdge(kind('arrow'))));
  await page.keyboard.up('Shift');
  await expect(outlines).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('pdf-mark-select.png') });
  await page.keyboard.press('Delete');
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark]`)).toHaveCount(0);
  await expect(outlines).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark]`)).toHaveCount(2);

  // Tab reaches a mark's control and selects it; a press on nothing lets it go.
  await page.locator('[data-pdf-pages]').focus();
  await rectangle.focus();
  await expect(outlines).toHaveCount(1);
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.38);
  await expect(outlines).toHaveCount(0);

  // A box drawn from empty space (the top margin) selects every mark it touches; ⇧ with one adds to the selection.
  await drag(page, first, [0.98, 0.01], [0.1, 0.36]);
  await expect(outlines).toHaveCount(2);
  await expect(page.locator('[data-pdf-mark-box]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('pdf-mark-box.png') });
  await page.mouse.click(...(await leftEdge(kind('rectangle'))));
  await expect(outlines).toHaveCount(1);
  await page.keyboard.down('Shift');
  await drag(page, first, [0.02, 0.29], [0.45, 0.35]);
  await page.keyboard.up('Shift');
  await expect(outlines).toHaveCount(2);
  expectNoPageErrors(pageErrors);
});

test.describe('by a finger', () => {
  test.use({ hasTouch: true });

  test('a finger’s tap selects the mark it lands on, and one on nothing lets it go', async ({
    page,
    pageErrors,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/explorer/all');
    await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
    await dropPdf(page, 'Marks.pdf', await textPdf(2));
    await page.waitForURL(/\/document\//, { timeout: 30_000 });
    const first = await pageOneDrawn(page);
    await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
    await drag(page, first, [0.5, 0.15], [0.75, 0.25]);
    const rectangle = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="rectangle"]`);
    await expect(rectangle).toHaveCount(1);
    await page.locator('[data-pdf-pages]').focus();
    await page.keyboard.press('v');
    const outlines = page.locator(`${PAGE_ONE} [data-pdf-mark-outline]`);
    await page.touchscreen.tap(...(await leftEdge(rectangle)));
    await expect(outlines).toHaveCount(1);
    const box = (await first.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height * 0.38);
    await expect(outlines).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });
});

test('a selected mark is resized by its handles and by ⌥ with the arrow keys', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Sizes.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const handle = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-handle="${name}"]`);

  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.5, 0.15], [0.7, 0.25]);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');

  // One mark selected shows its eight handles; its foot-right corner dragged sizes it.
  await page.mouse.click(...(await leftEdge(kind('rectangle'))));
  await expect(handle('se')).toHaveCount(1);
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark-handle]`)).toHaveCount(8);
  const before = (await kind('rectangle').boundingBox())!;
  const corner = (await handle('se').boundingBox())!;
  const [x, y] = [corner.x + corner.width / 2, corner.y + corner.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 30, { steps: 6 });
  await page.mouse.up();
  const sized = (await kind('rectangle').boundingBox())!;
  expect(sized.width).toBeCloseTo(before.width + 50, -1);
  expect(sized.height).toBeCloseTo(before.height + 30, -1);
  await page.screenshot({ path: test.info().outputPath('pdf-mark-resize.png') });

  // ⇧⌥→ widens it 10 points; undo takes that back.
  await page.getByRole('button', { name: /^Rectangle by / }).focus();
  await page.keyboard.press('Shift+Alt+ArrowRight');
  await expect
    .poll(async () => (await kind('rectangle').boundingBox())!.width)
    .toBeGreaterThan(sized.width + 5);
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => (await kind('rectangle').boundingBox())!.width)
    .toBeCloseTo(sized.width, 0);
  expectNoPageErrors(pageErrors);
});

test('the selected marks are restyled from the Colour control and the Format menu', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Looks.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const kind = (name: string) => page.locator(`${PAGE_ONE} [data-pdf-mark-kind="${name}"]`);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const colour = toolbar.getByRole('button', { name: 'Colour', exact: true });

  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.5, 0.15], [0.75, 0.25]);
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Arrow'])).click();
  await drag(page, first, [0.15, 0.32], [0.4, 0.32]);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  // With Select in hand and nothing selected there is no Colour.
  await expect(colour).toHaveCount(0);

  // Both selected: Colour is theirs; a Violet picked gives both its colour, one step of undo.
  await page.mouse.click(...(await leftEdge(kind('rectangle'))));
  await page.keyboard.down('Shift');
  await page.mouse.click(...(await leftEdge(kind('arrow'))));
  await page.keyboard.up('Shift');
  const red = (await kind('rectangle').getAttribute('stroke'))!;
  await expect(colour.locator('[data-colour-bar]')).toHaveAttribute('data-colour-bar', red);
  await colour.click();
  await page
    .getByRole('group', { name: 'Colour' })
    .getByRole('group', { name: 'Dark' })
    .getByRole('button', { name: 'Violet' })
    .click();
  const violet = (await kind('rectangle').getAttribute('stroke'))!;
  expect(violet).not.toBe(red);
  await expect(kind('arrow')).toHaveAttribute('stroke', violet);
  await expect(colour.locator('[data-colour-bar]')).toHaveAttribute('data-colour-bar', violet);

  // Format > Opacity 50% and Line width 8 pt reach both; the steps read checked.
  await (await officeMenuItem(page, ['Format', 'Opacity', '50%'])).click();
  await expect(kind('rectangle')).toHaveAttribute('opacity', '0.5');
  await expect(kind('arrow')).toHaveAttribute('opacity', '0.5');
  await (await officeMenuItem(page, ['Format', 'Line width', '8 pt'])).click();
  await expect(kind('rectangle').locator('[stroke-width]').first()).toHaveAttribute(
    'stroke-width',
    '8',
  );
  await expect(await officeMenuItem(page, ['Format', 'Line width', '8 pt'])).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');

  // Format > Line style dashes both lines; the Fill control, offered for the Rectangle, fills it inside its line.
  await (await officeMenuItem(page, ['Format', 'Line style', 'Dashed'])).click();
  await expect(kind('arrow').locator('polyline').first()).toHaveAttribute(
    'stroke-dasharray',
    '24 16',
  );
  const fill = toolbar.getByRole('button', { name: 'Fill', exact: true });
  await fill.click();
  await page
    .getByRole('group', { name: 'Fill' })
    .getByRole('group', { name: 'Light' })
    .getByRole('button', { name: 'Blue' })
    .click();
  const inside = kind('rectangle').locator('polygon').first();
  await expect(inside).toHaveAttribute('stroke', 'none');
  await expect(inside).toHaveAttribute('fill', /^#[0-9a-f]{6}$/);
  await expect(kind('rectangle').locator('polygon').nth(1)).toHaveAttribute(
    'stroke-dasharray',
    '24 16',
  );
  // Format > Line ends gives the Arrow a closed head: filled, as one polygon, its line no longer two polylines.
  await (await officeMenuItem(page, ['Format', 'Line ends', 'Arrow'])).click();
  await expect(kind('arrow').locator('polyline')).toHaveCount(1);
  await expect(kind('arrow').locator('polygon')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('pdf-mark-restyle.png') });

  // Undo takes back the end, the fill, the style, the width, the opacity, then the colour.
  await page.locator('[data-pdf-pages]').focus();
  for (let step = 0; step < 6; step += 1) await page.keyboard.press('ControlOrMeta+z');
  await expect(kind('rectangle').locator('polygon')).toHaveCount(1);
  await expect(kind('rectangle')).toHaveAttribute('stroke', red);
  await expect(kind('rectangle')).toHaveAttribute('opacity', '1');
  expectNoPageErrors(pageErrors);
});

// marks.md "Making a mark": A tool's line: with the Rectangle in hand the toolbar's Line width and Fill, and Format >
// Line style, set the tool's, which the next Rectangle takes, kept across a reload; "Changing a mark": Format > Colour
// opens the toolbar's Colour.
test('a tool keeps the line width, line style and fill chosen for it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Tool looks.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const rectangles = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="rectangle"]`);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const lineWidth = toolbar.getByRole('button', { name: /^Line width/ });

  // With Select in hand and nothing selected, Line width is dimmed.
  await expect(lineWidth).toHaveAttribute('aria-disabled', 'true');
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await lineWidth.click();
  await page.getByRole('menuitemradio', { name: '8 pt' }).click();
  await (await officeMenuItem(page, ['Format', 'Line style', 'Dotted'])).click();
  await toolbar.getByRole('button', { name: 'Fill', exact: true }).click();
  await page
    .getByRole('group', { name: 'Fill' })
    .getByRole('group', { name: 'Light' })
    .getByRole('button', { name: 'Yellow' })
    .click();
  await drag(page, first, [0.5, 0.15], [0.75, 0.25]);
  const made = rectangles.first();
  await expect(made.locator('polygon').first()).toHaveAttribute('stroke', 'none');
  await expect(made.locator('polygon').nth(1)).toHaveAttribute('stroke-width', '8');
  await expect(made.locator('polygon').nth(1)).toHaveAttribute('stroke-dasharray', '8 8');

  // Format > Colour opens the toolbar's Colour.
  await (await officeMenuItem(page, ['Format', 'Colour'])).click();
  await expect(page.getByRole('group', { name: 'Colour' }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('pdf-tool-line.png') });

  // Kept in this browser: after a reload the Rectangle tool draws the same again.
  await page.reload();
  const again = await pageOneDrawn(page);
  await expect(rectangles).toHaveCount(1);
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, again, [0.5, 0.3], [0.75, 0.4]);
  await expect(rectangles).toHaveCount(2);
  await expect(rectangles.nth(1).locator('polygon').nth(1)).toHaveAttribute('stroke-width', '8');
  await expect(rectangles.nth(1).locator('polygon').first()).toHaveAttribute('stroke', 'none');
  expectNoPageErrors(pageErrors);
});

// marks.md "Changing a mark": the toolbar's Font size is the selected Text's, its words wrapping again at the box's
// width as the box grows down; Format > Align text sets its lines, Justified a piece a word; each one step of undo.
test('a selected Text is given a size and an alignment', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Words.pdf', await textPdf(2));
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const text = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="text"]`);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const size = toolbar.getByRole('combobox', { name: 'Font size' });

  // A Text dragged 30% of the page wide, its words on two lines and more.
  await (await officeMenuItem(page, ['Insert', 'Text'])).click();
  await drag(page, first, [0.1, 0.1], [0.4, 0.14]);
  await page.keyboard.type('Check the totals in this table before Friday');
  await page.keyboard.press('Escape');
  await expect(text).toHaveCount(1);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  await expect(size).toHaveCount(0);

  // Selected: Font size is its own; 24 grows it down, its words wrapping again.
  const box = (await text.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(size).toHaveValue('12');
  const lines = await text.locator('text').count();
  await size.fill('24');
  await size.press('Enter');
  await expect(text.locator('text').first()).toHaveAttribute('font-size', '24');
  expect(await text.locator('text').count()).toBeGreaterThan(lines);
  expect((await text.boundingBox())!.height).toBeGreaterThan(box.height);
  await expect(size).toHaveValue('24');

  // Format > Align text: Justified sets each line but the last a piece a word, and reads checked.
  const wrapped = await text.locator('text').count();
  await (await officeMenuItem(page, ['Format', 'Align text', 'Justified'])).click();
  expect(await text.locator('text').count()).toBeGreaterThan(wrapped);
  await expect(await officeMenuItem(page, ['Format', 'Align text', 'Justified'])).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Escape closes Align text, then Format.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Align text' })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('pdf-mark-size-align.png') });

  // Undo takes back the alignment, then the size.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(text.locator('text')).toHaveCount(wrapped);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(text.locator('text').first()).toHaveAttribute('font-size', '12');
  expectNoPageErrors(pageErrors);
});

// marks.md "Changing a mark": the toolbar's Font is the selected Text's, Helvetica until one is chosen, a fixed list
// with no More fonts; "Words in every script": a mark in a chosen font is drawn in its family first, from LiveDoc's own
// origin, and downloaded with that family embedded as a subset.
test('a selected Text is given a font, drawn and downloaded in it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Fonts.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const text = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="text"]`);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });

  await (await officeMenuItem(page, ['Insert', 'Text'])).click();
  await drag(page, first, [0.1, 0.1], [0.4, 0.14]);
  await page.keyboard.type('Check the totals in this table before Friday');
  await page.keyboard.press('Escape');
  await expect(text).toHaveCount(1);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  await expect(toolbar.getByRole('button', { name: /^Font/ })).toHaveCount(0);

  // Selected: Font is Helvetica; its menu lists Helvetica and the served families, with no More fonts.
  const box = (await text.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const font = toolbar.getByRole('button', { name: 'Font: Helvetica' });
  await font.click();
  await expect(page.getByRole('menuitem', { name: 'More fonts' })).toHaveCount(0);
  await expect(page.getByRole('menuitemradio')).toHaveCount(18);
  await page.getByRole('menuitemradio', { name: 'Lora' }).click();
  await expect(toolbar.getByRole('button', { name: 'Font: Lora' })).toBeVisible();
  await expect(text.locator('g[font-family]').first()).toHaveAttribute(
    'font-family',
    /^"LiveDoc Lora", "LiveDoc Noto Sans"/,
  );
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "LiveDoc Lora"', 'Check')))
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('pdf-mark-font.png') });

  // Downloaded: the family embedded as a subset, its name in the default style.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = test.info().outputPath('Fonts.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  expect(added).toContain("/DS (font-family:'Lora')");
  expect(added).toMatch(/\/BaseFont \/[A-Z]{6}\+Lora-Regular/);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });

  // Undo gives it Helvetica again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toolbar.getByRole('button', { name: 'Font: Helvetica' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
