import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Columns (docs/specs/034-text-documents/page-layout.md "Columns"): the writing fills the first column down the page
// and goes on at the top of the next; text typed there lands there; the line between is drawn; a selection's own
// section of columns is balanced before the writing after it; each change is one undo step.

const BODY = '[role="textbox"][aria-label="Document body"]';
const LINE =
  'Columns lay the writing side by side, and the text fills the first one down the page.';

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

async function write(page: Page, paragraphs: readonly string[]) {
  await page.locator(BODY).click();
  for (const [i, text] of paragraphs.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.insertText(text);
  }
}

const boxOf = (page: Page, index: number) =>
  page
    .locator(`${BODY} > p`)
    .nth(index)
    .evaluate((p) => {
      const r = p.getBoundingClientRect();
      return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
    });

test('two columns: the writing goes on at the top of the second, typed there, its line drawn', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await write(
    page,
    Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}: ${LINE}`),
  );
  const body = page.locator(BODY);
  const before = await boxOf(page, 0);

  await (await officeMenuItem(page, ['Format', 'Columns', 'Two columns'])).click();
  // The writing narrows to a column; a later paragraph stands in the second, up at the page's top.
  await expect.poll(async () => (await boxOf(page, 0)).width).toBeLessThan(before.width * 0.6);
  const second = body.locator('> p[data-column="1"]').first();
  await expect(second).toBeVisible();
  const first = await boxOf(page, 0);
  const moved = await second.evaluate((p) => p.getBoundingClientRect());
  expect(moved.left).toBeGreaterThan(first.left + first.width);
  expect(moved.top).toBeLessThan(first.top + 200);
  await page.screenshot({ path: test.info().outputPath('two-columns.png') });

  // Column options: the line between, drawn on the sheet.
  await (await officeMenuItem(page, ['Format', 'Columns', 'More options'])).click();
  const dialog = page.getByRole('dialog', { name: 'Column options' });
  await expect(dialog.getByRole('radio', { name: 'Two columns' })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Line between columns' }).check();
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('column-options.png') });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-column-line]').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('line-between.png') });

  // One undo step each: the line goes, then the columns.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-column-line]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator('> p[data-column]')).toHaveCount(0);
  await expect.poll(async () => (await boxOf(page, 0)).width).toBeCloseTo(before.width, 0);

  // Back again, and typed in the second column, the text lands in that paragraph.
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(second).toBeVisible();
  await second.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Typed here.');
  await expect(second).toContainText('Typed here.');
  expectNoPageErrors(pageErrors);
});

test('selected paragraphs in columns of their own, balanced above the writing after them', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await write(page, [
    'Before the columns.',
    ...Array.from({ length: 8 }, (_, i) => `Item ${i + 1}`),
    'After.',
  ]);
  const body = page.locator(BODY);
  // Select from the second paragraph to the ninth.
  await body.locator('> p').nth(1).click();
  await page.keyboard.press('Home');
  await body
    .locator('> p')
    .nth(8)
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Shift+End');
  await page.waitForTimeout(100);

  await (await officeMenuItem(page, ['Format', 'Columns', 'Two columns'])).click();
  // Two continuous section breaks around them.
  await expect(body.locator('hr')).toHaveCount(2);
  await expect(body.locator('> p[data-column="1"]')).toHaveCount(4);
  const items = await body.locator('> p').evaluateAll((ps) =>
    ps.map((p) => {
      const r = p.getBoundingClientRect();
      return { text: p.textContent, left: Math.round(r.left), top: r.top, bottom: r.bottom };
    }),
  );
  const firstColumn = items.slice(1, 5);
  const secondColumn = items.slice(5, 9);
  // Four and four, side by side from the same top.
  expect(secondColumn[0]!.top).toBeCloseTo(firstColumn[0]!.top, 0);
  expect(secondColumn[0]!.left).toBeGreaterThan(firstColumn[0]!.left);
  // The writing after them starts under the longer column.
  const after = items[9]!;
  expect(after.top).toBeGreaterThanOrEqual(
    Math.max(firstColumn[3]!.bottom, secondColumn[3]!.bottom) - 1,
  );
  expect(after.top).toBeLessThan(Math.max(firstColumn[3]!.bottom, secondColumn[3]!.bottom) + 40);
  await page.screenshot({ path: test.info().outputPath('balanced.png') });

  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator('hr')).toHaveCount(0);
  await expect(body.locator('> p[data-column]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

test('a column break starts the next column, dimmed in one column, one undo step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await write(page, ['First column', 'Second column']);
  const body = page.locator(BODY);

  // One column: Column break is dimmed.
  const dimmed = await officeMenuItem(page, ['Insert', 'Break', 'Column break']);
  await expect(dimmed).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // The caret into the first paragraph by the keyboard: a click where write() clicked moments ago is a double-click.
  await page.keyboard.press('ControlOrMeta+Home');
  await (await officeMenuItem(page, ['Format', 'Columns', 'Two columns'])).click();
  // The caret at the second paragraph's start: the break moves it to the second column.
  await body.locator('> p').nth(1).click();
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await (await officeMenuItem(page, ['Insert', 'Break', 'Column break'])).click();
  const second = body.locator('> p').filter({ hasText: 'Second column' });
  await expect(second).toHaveAttribute('data-column', '1');
  const [a, b] = await Promise.all([
    boxOf(page, 0),
    second.evaluate((p) => p.getBoundingClientRect().top),
  ]);
  expect(b).toBeCloseTo(a.top, 0);
  await page.screenshot({ path: test.info().outputPath('column-break.png') });

  await page.keyboard.press('ControlOrMeta+z');
  await expect(second).not.toHaveAttribute('data-column', '1');
  expectNoPageErrors(pageErrors);
});

// editing-surface.md "The ruler", "In a section of columns": the gap grey, the caret's column's indents on the ruler.
test("the ruler shows the caret's column: the gap grey, its indents at the column's start", async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await write(page, ['First column', 'Second column']);
  const body = page.locator(BODY);
  // The caret into the first paragraph by the keyboard: a click where write() clicked moments ago is a double-click.
  await page.keyboard.press('ControlOrMeta+Home');
  await (await officeMenuItem(page, ['Format', 'Columns', 'Two columns'])).click();
  await body.locator('> p').nth(1).click();
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await (await officeMenuItem(page, ['Insert', 'Break', 'Column break'])).click();
  const second = body.locator('> p').filter({ hasText: 'Second column' });
  await expect(second).toHaveAttribute('data-column', '1');
  await expect(page.locator('[data-ruler-gap]')).toHaveCount(1);

  const indentX = () =>
    page
      .getByRole('slider', { name: 'Left indent' })
      .evaluate((m) => m.getBoundingClientRect().left + m.getBoundingClientRect().width / 2);
  const firstParagraph = body.locator('> p').first();
  // Where a paragraph's text starts: its indent is padding inside its box.
  const leftOf = (index: 0 | 1) =>
    (index === 0 ? firstParagraph : second).evaluate((p) => {
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.setEnd(p.firstChild!, 1);
      return range.getBoundingClientRect().left;
    });

  // In the first column, the marker at its start; in the second, at the second's.
  await firstParagraph.click();
  await expect.poll(async () => Math.abs((await indentX()) - (await leftOf(0)))).toBeLessThan(2);
  await second.click();
  await expect.poll(async () => Math.abs((await indentX()) - (await leftOf(1)))).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath('ruler-in-columns.png') });

  // Moved from the keyboard, the second column's paragraph indents from its own start.
  const was = await leftOf(1);
  const slider = page.getByRole('slider', { name: 'Left indent' });
  await slider.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => leftOf(1)).toBeGreaterThan(was + 60);
  await expect(slider).toHaveAttribute('aria-valuetext', /^(1 in|2\.54 cm)$/);
  await expect.poll(async () => Math.abs((await indentX()) - (await leftOf(1)))).toBeLessThan(2);
  expectNoPageErrors(pageErrors);
});
