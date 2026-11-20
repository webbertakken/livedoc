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
