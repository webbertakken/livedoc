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
  expectNoPageErrors(pageErrors);
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
