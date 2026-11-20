import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Breaks in a text document (docs/specs/034-text-documents/page-layout.md "Breaks"): ⌘Enter starts the rest on a new
// page, one undo step; Backspace at its start takes the break away; Add page break before does the same as a switch;
// a section break on the next page starts a page, a continuous one does not; both shown by name with the
// non-printing characters.

const BODY = '[role="textbox"][aria-label="Document body"]';

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

const pages = (page: Page) =>
  page
    .locator('[data-page-format="pages"]')
    .getAttribute('data-pages')
    .then((n) => Number(n));

// How far a paragraph's top lies below the top of the page it is on, in inches of that page.
const placeOnPage = (page: Page, index: number) =>
  page.evaluate(
    ({ selector, index }) => {
      const paragraph = document.querySelectorAll(`${selector} p`)[index]!.getBoundingClientRect();
      const sheets = [...document.querySelectorAll('[data-page-sheet]')].map((s) =>
        s.getBoundingClientRect(),
      );
      const sheet = sheets.findLast((s) => s.top <= paragraph.top)!;
      return {
        page: sheets.indexOf(sheet) + 1,
        inches: (paragraph.top - sheet.top) / (sheet.height / 11),
      };
    },
    { selector: BODY, index },
  );

test('a page break starts the rest on a new page, and Backspace takes it away', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('First page');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.type('Second page');
  await expect.poll(() => pages(page)).toBe(2);
  await expect(body.locator('p')).toHaveText(['First page', 'Second page']);
  const second = await placeOnPage(page, 1);
  expect(second.page).toBe(2);
  expect(second.inches).toBeCloseTo(1, 1);
  await page.screenshot({ path: test.info().outputPath('page-break.png') });

  // Shown by name with the non-printing characters.
  await (await officeMenuItem(page, ['View', 'Show non-printing characters'])).click();
  const label = await body
    .locator('p')
    .nth(1)
    .evaluate((p) => getComputedStyle(p, '::before').content);
  expect(label).toContain('Page break');
  await page.screenshot({ path: test.info().outputPath('page-break-shown.png') });
  await (await officeMenuItem(page, ['View', 'Show non-printing characters'])).click();

  // Backspace at the start of the second page takes the break away, and nothing else.
  await body.locator('p').nth(1).click();
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Backspace');
  await expect.poll(() => pages(page)).toBe(1);
  await expect(body.locator('p')).toHaveText(['First page', 'Second page']);

  // Add page break before is the same break as a switch, checked while on.
  await (
    await officeMenuItem(page, ['Format', 'Line & paragraph spacing', 'Add page break before'])
  ).click();
  await expect.poll(() => pages(page)).toBe(2);
  const item = await officeMenuItem(page, [
    'Format',
    'Line & paragraph spacing',
    'Add page break before',
  ]);
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});

test('a section break on the next page starts a page, a continuous one does not', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Before the section');
  await (await officeMenuItem(page, ['Insert', 'Break', 'Section break (continuous)'])).click();
  await page.keyboard.type('In the section');
  await expect(body.locator('hr[data-start="continuous"]')).toHaveCount(1);
  expect(await pages(page)).toBe(1);
  // In print layout a section break shows nothing.
  await expect(body.locator('hr')).toHaveCSS('height', '0px');

  await (await officeMenuItem(page, ['Insert', 'Break', 'Section break (next page)'])).click();
  await expect.poll(() => pages(page)).toBe(2);
  // One undo step takes it away, and redo brings it back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator('hr')).toHaveCount(1);
  await expect.poll(() => pages(page)).toBe(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(body.locator('hr')).toHaveCount(2);
  await body.locator('p').last().click();
  await page.keyboard.type('On its own page');
  await expect.poll(() => pages(page)).toBe(2);
  await expect(body.locator('p')).toHaveText([
    'Before the section',
    'In the section',
    'On its own page',
  ]);

  await (await officeMenuItem(page, ['View', 'Show non-printing characters'])).click();
  const names = await body
    .locator('hr')
    .evaluateAll((hrs) => hrs.map((hr) => getComputedStyle(hr, '::after').content));
  expect(names[0]).toContain('Section break (continuous)');
  expect(names[1]).toContain('Section break (next page)');
  await page.screenshot({ path: test.info().outputPath('section-breaks.png') });

  expectNoPageErrors(pageErrors);
});
