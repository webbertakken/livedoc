import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Non-printing characters on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Non-printing
// characters"): ⌘⇧P shows ¶, ·, → and ↵ in the writing, never in its text; View hides them, remembered after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('non-printing characters show and hide, and stay out of the text', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Two words');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('next line');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('tabbed');
  await expect(body.locator('.text-document-pilcrow')).toHaveCount(0);

  // ⌘⇧P (Ctrl+Shift+P elsewhere) shows them: one ¶ a paragraph, a · a space, a ↵, and → on the tab.
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(body).toHaveClass(/text-document-marks/);
  await expect(body.locator('.text-document-pilcrow')).toHaveCount(2);
  await expect(body.locator('.text-document-space-mark')).toHaveCount(2);
  await expect(body.locator('.text-document-break-mark')).toHaveCount(1);
  const arrow = await body
    .locator('.text-document-tab')
    .first()
    .evaluate((el) => getComputedStyle(el, '::before').content);
  expect(arrow).toContain('→');
  await expect(body).toBeFocused();
  // Never part of the text.
  expect(await body.textContent()).toBe('Two words\nnext line\ttabbed');
  await page.screenshot({ path: test.info().outputPath('non-printing.png') });

  // View > Show non-printing characters hides them, and they stay hidden after a reload.
  await (await officeMenuItem(page, ['View', 'Show non-printing characters'])).click();
  await expect(body.locator('.text-document-pilcrow')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('.text-document-pilcrow')).toHaveCount(0);
  await (await officeMenuItem(page, ['View', 'Show non-printing characters'])).click();
  await expect(body.locator('.text-document-pilcrow')).toHaveCount(2);
  expectNoPageErrors(pageErrors);
});
