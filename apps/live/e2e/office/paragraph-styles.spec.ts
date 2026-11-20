import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Paragraph styles on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles"): the
// toolbar's Styles control, Format > Paragraph styles and Ctrl+Alt+0 to 6 apply a style to the paragraphs the
// selection touches; each paragraph draws in its style, and stays so after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('paragraph styles are applied three ways and drawn in their look', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const first = body.locator('p').first();
  const second = body.locator('p').nth(1);

  await body.click();
  await page.keyboard.type('Field notes');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The river was high.');
  await expect(toolbar.getByRole('button', { name: 'Styles: Normal text' })).toBeVisible();
  await expect(second).toHaveCSS('font-size', '14.6667px');

  // Heading 1 from the toolbar, on the first paragraph: 20 pt, with its space before.
  await first.click();
  await toolbar.getByRole('button', { name: 'Styles: Normal text' }).click();
  await page
    .getByRole('menu', { name: 'Styles' })
    .getByRole('menuitemradio', { name: 'Heading 1' })
    .click();
  await expect(body).toBeFocused();
  await expect(first).toHaveCSS('font-size', '26.6667px');
  await expect(toolbar.getByRole('button', { name: 'Styles: Heading 1' })).toBeVisible();

  // Ctrl+Alt+3 on the second, then Ctrl+Alt+0 back to Normal text.
  await second.click();
  await page.keyboard.press('Control+Alt+3');
  await expect(second).toHaveCSS('font-size', '18.6667px');
  await expect(second).toHaveCSS('color', 'rgb(67, 67, 67)');
  await page.keyboard.press('Control+Alt+0');
  await expect(second).toHaveCSS('font-size', '14.6667px');

  // Format > Paragraph styles > Subtitle, over both paragraphs: the control reads it, then blank when they differ.
  await page.keyboard.press('ControlOrMeta+a');
  await (await officeMenuItem(page, ['Format', 'Paragraph styles', 'Subtitle'])).click();
  await expect(first).toHaveCSS('font-size', '20px');
  await expect(toolbar.getByRole('button', { name: 'Styles: Subtitle' })).toBeVisible();
  // A press inside the selection would start a drag, so the caret goes to the end by key.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Control+Alt+1');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(toolbar.getByRole('button', { name: 'Styles', exact: true })).toBeVisible();

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('p').first()).toHaveCSS('font-size', '20px');
  await expect(body.locator('p').nth(1)).toHaveCSS('font-size', '26.6667px');
  expectNoPageErrors(pageErrors);
});
