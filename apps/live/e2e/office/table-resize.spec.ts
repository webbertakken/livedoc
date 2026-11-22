import { expect, expectNoPageErrors, test } from '../fixtures';

// Resizing a table by its borders (docs/specs/034-text-documents/tables.md "Working in a table", Resize): dragging the
// border between two columns moves width from one to the other, the table keeping its width; dragging a row's bottom
// border sets its height; Escape cancels; undo puts it back.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('a table is resized by dragging its borders', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  await page.locator('[data-size-cell="3x2"]').hover();
  await page.locator('[data-size-cell="3x2"]').click();
  await page.keyboard.type('a1');
  const table = body.locator('table.text-document-table').first();
  const cells = table.locator(':scope > tbody > tr > td');
  const widths = () =>
    cells.evaluateAll((all) =>
      all.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().width)),
    );
  const before = await widths();
  const tableWidth = await table.evaluate((t) => Math.round(t.getBoundingClientRect().width));

  // The border between the first two columns, dragged 60 px right.
  const first = (await cells.first().boundingBox())!;
  const x = first.x + first.width - 1;
  const y = first.y + first.height / 2;
  await page.mouse.move(x, y);
  await expect(body).toHaveAttribute('data-table-resize', 'column');
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 3 });
  await page.mouse.move(x + 60, y, { steps: 3 });
  const guide = page.locator('.text-document-table-resize-guide');
  await expect(guide).toBeVisible();
  // Drawn in the shell's accent, and the press selects no cells.
  expect(await guide.evaluate((g) => getComputedStyle(g).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  await expect(table.locator('.selectedCell')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-resize-guide.png') });
  await page.mouse.up();
  await expect.poll(async () => (await widths())[0]).toBeGreaterThan(before[0]! + 50);
  const after = await widths();
  expect(after[1]).toBeLessThan(before[1]! - 50);
  expect(after[2]).toBe(before[2]);
  expect(await table.evaluate((t) => Math.round(t.getBoundingClientRect().width))).toBe(tableWidth);
  await expect(page.locator('.text-document-table-resize-guide')).toHaveCount(0);

  // Undo puts the widths back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await widths())[0]).toBe(before[0]);

  // A row's bottom border dragged 40 px down sets its height; Escape before a release changes nothing.
  const height = () => cells.first().evaluate((c) => Math.round(c.getBoundingClientRect().height));
  const rowHeight = await height();
  const cell = (await cells.first().boundingBox())!;
  const bottom = cell.y + cell.height - 1;
  const middle = cell.x + cell.width / 2;
  await page.mouse.move(middle, bottom);
  await expect(body).toHaveAttribute('data-table-resize', 'row');
  await page.mouse.down();
  await page.mouse.move(middle, bottom + 40, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await height()).toBe(rowHeight);
  await page.mouse.move(middle, bottom);
  await page.mouse.down();
  await page.mouse.move(middle, bottom + 40, { steps: 4 });
  await page.mouse.up();
  await expect.poll(height).toBeGreaterThan(rowHeight + 30);
  expectNoPageErrors(pageErrors);
});
