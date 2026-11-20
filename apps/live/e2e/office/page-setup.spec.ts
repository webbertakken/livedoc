import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Page setup on a text document (docs/specs/034-text-documents/page-layout.md "Page setup"): File > Page setup sets
// the paper, orientation, margins and colour as one undo step; Format > Page orientation turns the page; Set as
// default makes the next new text document start on it.

const BODY = '[role="textbox"][aria-label="Document body"]';
// CSS pixels per point.
const PX = 96 / 72;

const pageWidth = (page: Page) =>
  page.locator('.text-document-page').evaluate((el) => el.getBoundingClientRect().width);

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

test('page setup sets the paper, orientation, margins and colour', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  const sheet = page.locator('.text-document-page');
  await body.click();
  await page.keyboard.type('On the page');
  // A new document in an American English browser: Letter, 8.5 in across.
  await expect.poll(() => pageWidth(page)).toBeCloseTo(612 * PX, 0);
  const paperBefore = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor);

  await (await officeMenuItem(page, ['File', 'Page setup'])).click();
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await expect(dialog.getByRole('combobox', { name: 'Paper size' })).toHaveValue('letter');
  await dialog.getByRole('combobox', { name: 'Paper size' }).selectOption('a4');
  await dialog.getByRole('radio', { name: 'Landscape' }).check();
  await dialog.getByRole('textbox', { name: 'Top margin (in)' }).fill('0.5');
  await dialog.getByRole('button', { name: 'Page colour' }).click();
  await page
    .getByRole('button', { name: /yellow/i })
    .first()
    .click();
  await page.screenshot({ path: test.info().outputPath('page-setup-dialog.png') });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();
  await expect(body).toBeFocused();

  // A4 landscape, half an inch at the top, coloured.
  await expect.poll(() => pageWidth(page)).toBeCloseTo(841.89 * PX, 0);
  await expect(sheet).toHaveCSS('padding-top', '48px');
  await expect(sheet).not.toHaveCSS('background-color', paperBefore);
  await page.screenshot({ path: test.info().outputPath('page-setup-applied.png') });

  // One undo step takes it all back, and redo brings it again.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(612 * PX, 0);
  await expect(sheet).toHaveCSS('background-color', paperBefore);
  await expect(page.locator(BODY)).toContainText('On the page');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(841.89 * PX, 0);

  // Kept after a reload, and the dialog opens on it.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect.poll(() => pageWidth(page)).toBeCloseTo(841.89 * PX, 0);
  await expect(sheet).not.toHaveCSS('background-color', paperBefore);
  await body.click();
  await (await officeMenuItem(page, ['File', 'Page setup'])).click();
  await expect(dialog.getByRole('combobox', { name: 'Paper size' })).toHaveValue('a4');
  await expect(dialog.getByRole('radio', { name: 'Landscape' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Format > Page orientation turns the page.
  await (await officeMenuItem(page, ['Format', 'Page orientation'])).click();
  const orientation = page.getByRole('dialog', { name: 'Page orientation' });
  await expect(orientation.getByRole('radio', { name: 'Landscape' })).toBeChecked();
  await orientation.getByRole('radio', { name: 'Portrait' }).check();
  await orientation.getByRole('button', { name: 'OK' }).click();
  await expect.poll(() => pageWidth(page)).toBeCloseTo(595.276 * PX, 0);
  expectNoPageErrors(pageErrors);
});

test('a new text document starts on the default page setup', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDocument(page);
  await page.locator(BODY).click();
  await (await officeMenuItem(page, ['File', 'Page setup'])).click();
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await dialog.getByRole('combobox', { name: 'Paper size' }).selectOption('a5');
  await dialog.getByRole('button', { name: 'Set as default' }).click();
  await expect(dialog.getByRole('button', { name: 'Saved as default' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // Set as default changes no document.
  await expect.poll(() => pageWidth(page)).toBeCloseTo(612 * PX, 0);

  await newDocument(page);
  await expect.poll(() => pageWidth(page)).toBeCloseTo(419.528 * PX, 0);
  await page.locator(BODY).click();
  await page.keyboard.type('Starts on A5');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect.poll(() => pageWidth(page)).toBeCloseTo(419.528 * PX, 0);
  expectNoPageErrors(pageErrors);
});

test('pageless draws one column and switches back', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDocument(page);
  const body = page.locator(BODY);
  const sheet = page.locator('.text-document-page');
  await body.click();
  await page.keyboard.type('Without pages');

  // Format > Switch to Pageless format: a column 8 in wide, no sheet, no margins on the ruler.
  await (await officeMenuItem(page, ['Format', 'Switch to Pageless format'])).click();
  await expect(sheet).toHaveAttribute('data-page-format', 'pageless');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(576 * PX, 0);
  await expect(sheet).toHaveCSS('box-shadow', 'none');
  await expect(page.getByRole('slider', { name: 'Left margin' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Left indent' })).toBeVisible();
  await expect(body).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('pageless.png') });

  // One undo step back to pages, and again by redo.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(sheet).toHaveAttribute('data-page-format', 'pages');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(sheet).toHaveAttribute('data-page-format', 'pageless');

  // Kept after a reload; Page setup opens on its Pageless tab, and its Pages tab switches back.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(sheet).toHaveAttribute('data-page-format', 'pageless');
  await body.click();
  await (await officeMenuItem(page, ['File', 'Page setup'])).click();
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await expect(dialog.getByRole('tab', { name: 'Pageless' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Past the dialog's entrance, for the capture.
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('pageless-dialog.png') });
  await dialog.getByRole('tab', { name: 'Pages' }).click();
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(sheet).toHaveAttribute('data-page-format', 'pages');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(612 * PX, 0);

  // The Format item reads as the switch it makes.
  await (await officeMenuItem(page, ['Format', 'Switch to Pageless format'])).click();
  await expect(sheet).toHaveAttribute('data-page-format', 'pageless');
  await (await officeMenuItem(page, ['Format', 'Switch to Pages format'])).click();
  await expect(sheet).toHaveAttribute('data-page-format', 'pages');
  expectNoPageErrors(pageErrors);
});
