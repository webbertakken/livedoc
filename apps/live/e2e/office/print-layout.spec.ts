import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// View > Show print layout and View > Text width (docs/specs/034-text-documents/page-layout.md "Print layout",
// "Pageless"): print layout off lays no pages, one sheet as on a phone; Text width sets the pageless column, a
// person's own, kept after a reload; each item dimmed where it does nothing.

const BODY = '[role="textbox"][aria-label="Document body"]';
const PX = 96 / 72;
const TEXT =
  'Print layout off lays the writing on one sheet, and the text width sets how wide a pageless column is.';

const pageWidth = (page: Page) =>
  page.locator('.text-document-page').evaluate((el) => el.getBoundingClientRect().width);

test('print layout off lays no pages; the text width sets the pageless column', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await page.locator(BODY).click();
  for (let i = 0; i < 30; i++) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.insertText(`Paragraph ${i + 1}. ${TEXT}`);
  }
  await expect(page.locator('[data-page-sheet="2"]')).toBeVisible();
  const laidOut = page.locator('[data-laid-out]');

  // View > Show print layout off: one sheet, no pages; on again: pages.
  const printLayout = await officeMenuItem(page, ['View', 'Show print layout']);
  await expect(printLayout).toHaveAttribute('aria-checked', 'true');
  await printLayout.click();
  await expect(laidOut).toHaveAttribute('data-laid-out', 'flow');
  await expect(page.locator('[data-page-sheet]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('print-layout-off.png') });
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(laidOut).toHaveAttribute('data-laid-out', 'flow');
  await (await officeMenuItem(page, ['View', 'Show print layout'])).click();
  await expect(laidOut).toHaveAttribute('data-laid-out', 'pages');

  // Text width is dimmed while there are pages; pageless, Wide draws a column 10 in wide.
  await expect(await officeMenuItem(page, ['View', 'Text width', 'Wide'])).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Closed: the submenu, then the menu.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await (await officeMenuItem(page, ['Format', 'Switch to Pageless format'])).click();
  await expect.poll(() => pageWidth(page)).toBeCloseTo(576 * PX, 0);
  await (await officeMenuItem(page, ['View', 'Text width', 'Wide'])).click();
  await expect.poll(() => pageWidth(page)).toBeCloseTo(720 * PX, 0);
  await expect(await officeMenuItem(page, ['View', 'Show print layout'])).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expectNoPageErrors(pageErrors);
});
