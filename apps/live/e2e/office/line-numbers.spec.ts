import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Line numbers (docs/specs/034-text-documents/page-layout.md "Line numbers"): Tools > Line numbers opens the panel;
// Show line numbers draws a number beside every line of the body in the left margin, counted on through the pages;
// Restart on each page starts each page at 1; turning it off takes them away; each change is one undo step.

const BODY = '[role="textbox"][aria-label="Document body"]';
const LINE =
  'Line numbers stand in the left margin beside each line of the writing, for referring to a line.';

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

const numbersOn = (page: Page, sheet: number) =>
  page.locator(`[data-page-sheet="${sheet}"] [data-line-number]`).allTextContents();

test('line numbers: the panel shows them beside every line, on through the pages, then from 1 on each', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await write(
    page,
    Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: ${LINE}`),
  );
  await expect(page.locator('[data-page-sheet="2"]')).toBeAttached();
  await expect(page.locator('[data-line-number]')).toHaveCount(0);

  await (await officeMenuItem(page, ['Tools', 'Line numbers'])).click();
  const panel = page.getByRole('complementary', { name: 'Line numbers' });
  await expect(panel).toBeVisible();
  const show = panel.getByRole('checkbox', { name: 'Show line numbers' });
  // Focus moves into the panel, on its first control.
  await expect(show).toBeFocused();
  await expect(panel.getByRole('radio', { name: 'Restart on each page' })).toBeDisabled();
  await expect(panel.getByRole('combobox', { name: 'Apply to' })).toBeDisabled();
  await show.check();

  // Page 1 numbers 1 up; page 2 counts on from page 1's last.
  await expect.poll(async () => (await numbersOn(page, 1)).length).toBeGreaterThan(20);
  const first = await numbersOn(page, 1);
  expect(first.slice(0, 3)).toEqual(['1', '2', '3']);
  const second = await numbersOn(page, 2);
  expect(second[0]).toBe(String(first.length + 1));
  // Each number stands in the margin, before the text, level with its line.
  const firstLine = await page
    .locator(`${BODY} > p`)
    .first()
    .evaluate((p) => p.getBoundingClientRect().toJSON() as DOMRect);
  const one = await page.locator('[data-page-sheet="1"] [data-line-number="1"]').boundingBox();
  expect(one!.x + one!.width).toBeLessThan(firstLine.left);
  expect(Math.abs(one!.y + one!.height / 2 - (firstLine.top + 10))).toBeLessThan(8);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('line-numbers.png') });

  await panel.getByRole('radio', { name: 'Restart on each page' }).check();
  await expect.poll(async () => (await numbersOn(page, 2))[0]).toBe('1');
  await page.screenshot({ path: test.info().outputPath('restart-each-page.png') });

  // Each change is one undo step: back to counting on, then none.
  await page.locator(`${BODY} > p`).first().click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await numbersOn(page, 2))[0]).toBe(String(first.length + 1));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-line-number]')).toHaveCount(0);
  await expect(show).not.toBeChecked();

  // The panel closes from Tools > Line numbers again.
  await (await officeMenuItem(page, ['Tools', 'Line numbers'])).click();
  await expect(panel).toBeHidden();
  expectNoPageErrors(pageErrors);
});

test('line numbers: a Viewer sees no Tools > Line numbers', async ({ page, pageErrors }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await page.getByRole('button', { name: 'Mode: Editing' }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Tools' })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Word count', exact: true })).toBeVisible();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Line numbers', exact: true }),
  ).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
