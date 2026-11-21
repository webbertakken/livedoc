import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Watermark (docs/specs/034-text-documents/page-layout.md "Watermark"): Insert > Watermark opens the panel on Text; the
// words apply once typing pauses and every page draws them behind the writing; a choice changes it at once; Remove
// watermark takes it away; each change is one undo step; Done closes the panel.

const BODY = '[role="textbox"][aria-label="Document body"]';

async function newDocument(page: Page) {
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
}

test('watermark: typed in the panel, drawn behind every page, changed, removed and undone', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await page.locator(BODY).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.insertText('The second page.');
  await expect(page.locator('[data-page-sheet="2"]')).toBeAttached();

  await (await officeMenuItem(page, ['Insert', 'Watermark'])).click();
  const panel = page.getByRole('complementary', { name: 'Watermark' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Image' })).toHaveAttribute('aria-disabled', 'true');
  const words = panel.getByRole('textbox', { name: 'Text' });
  await expect(words).toBeFocused();
  await words.fill('DRAFT');
  // Every page draws it, on the diagonal, behind the writing.
  await expect(page.locator('[data-watermark="DRAFT"]')).toHaveCount(2);
  const mark = page.locator('[data-page-sheet="1"] [data-watermark]');
  await expect(mark).toHaveCSS('opacity', '0.5');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('watermark.png') });

  await panel.getByRole('radio', { name: 'Horizontal' }).check();
  await panel.getByRole('button', { name: 'Bold' }).click();
  await expect(panel.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  await expect(mark.locator('text')).toHaveAttribute('font-weight', 'bold');
  await page.screenshot({ path: test.info().outputPath('horizontal-bold.png') });

  await panel.getByRole('button', { name: 'Remove watermark' }).click();
  await expect(page.locator('[data-watermark]')).toHaveCount(0);
  await expect(words).toHaveValue('');

  // One undo step each: back comes the bold horizontal one, then the plain one.
  await page.locator(BODY).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(mark.locator('text')).toHaveAttribute('font-weight', 'bold');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(mark.locator('text')).toHaveAttribute('font-weight', 'normal');

  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(panel).toBeHidden();
  // Pageless draws none.
  await (await officeMenuItem(page, ['Format', 'Switch to Pageless format'])).click();
  await expect(page.locator('[data-watermark]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

test('watermark: a Viewer has no Insert > Watermark', async ({ page, pageErrors }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await newDocument(page);
  await page.getByRole('button', { name: 'Mode: Editing' }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();
  // Nothing on Insert is a Viewer's, so the menu is not drawn at all.
  const bar = page.getByRole('menubar', { name: 'Menu bar' });
  await expect(bar.getByRole('menuitem', { name: 'View' })).toBeVisible();
  await expect(bar.getByRole('menuitem', { name: 'Insert' })).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
