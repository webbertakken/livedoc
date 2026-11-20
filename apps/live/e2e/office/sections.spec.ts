import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Sections with their own setup (docs/specs/034-text-documents/page-layout.md "Each page is drawn at its section's
// setup"): the ruler shows the section the caret is in, a margin set there moves only that section's writing, and
// undo takes it back.

const BODY = '[role="textbox"][aria-label="Document body"]';

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

const leftOf = (page: Page, index: number) =>
  page
    .locator(`${BODY} p`)
    .nth(index)
    .evaluate((p) => p.getBoundingClientRect().left);

test('a section keeps its own margins, set on the ruler where the caret is', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('First section');
  await (await officeMenuItem(page, ['Insert', 'Break', 'Section break (next page)'])).click();
  await page.keyboard.type('Second section');
  await expect(body.locator('p')).toHaveText(['First section', 'Second section']);
  const before = await leftOf(page, 1);

  // The caret is in the second section: its left margin moves in, the first's stays.
  const margin = page.getByRole('slider', { name: 'Left margin' });
  const was = Number(await margin.getAttribute('aria-valuenow'));
  await margin.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => Number(await margin.getAttribute('aria-valuenow')))
    .toBeGreaterThan(was);
  await expect.poll(() => leftOf(page, 1)).toBeGreaterThan(before + 10);
  expect(await leftOf(page, 0)).toBeCloseTo(before, 0);
  await page.screenshot({ path: test.info().outputPath('section-margins.png') });

  // In the first section the ruler shows its own margin.
  await body.locator('p').first().click();
  await expect.poll(async () => Number(await margin.getAttribute('aria-valuenow'))).toBe(was);
  await body.locator('p').last().click();
  await expect
    .poll(async () => Number(await margin.getAttribute('aria-valuenow')))
    .toBeGreaterThan(was);

  // One undo step takes the margin back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => leftOf(page, 1)).toBeCloseTo(before, 0);
  expectNoPageErrors(pageErrors);
});

test('Apply to: selected content on a landscape page of its own, one undo step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  await body.click();
  for (const [i, line] of ['One', 'Two', 'Three'].entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
  // Select the second paragraph.
  await body.locator('p').nth(1).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.waitForTimeout(100);

  await (await officeMenuItem(page, ['File', 'Page setup'])).click();
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await dialog.getByRole('combobox', { name: 'Apply to' }).selectOption('selection');
  await dialog.getByRole('radio', { name: 'Landscape' }).check();
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('apply-to.png') });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();

  const widths = () =>
    page
      .locator('[data-page-sheet]')
      .evaluateAll((sheets) => sheets.map((s) => Math.round(s.getBoundingClientRect().width)));
  await expect.poll(async () => (await widths()).length).toBe(3);
  const [first, second, third] = await widths();
  expect(second).toBeGreaterThan(first!);
  expect(third).toBe(first);
  await expect(body.locator('hr')).toHaveCount(2);
  await page
    .locator('[data-page-sheet="2"]')
    .evaluate((s) => s.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: test.info().outputPath('apply-to-applied.png') });

  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator('hr')).toHaveCount(0);
  await expect.poll(async () => (await widths()).length).toBe(1);
  expectNoPageErrors(pageErrors);
});
