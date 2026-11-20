import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Borders and shading on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Borders and
// shading"): the dialog boxes two paragraphs, which share one box, shades them, and Reset takes it all away; kept
// after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('paragraphs are boxed and shaded, share one box, and reset', async ({ page, pageErrors }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const first = body.locator('p').nth(0);
  const second = body.locator('p').nth(1);
  const third = body.locator('p').nth(2);

  await body.click();
  await page.keyboard.type('Boxed one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Boxed two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');

  // An OpenDocument text document: Between is dimmed.
  await (await officeMenuItem(page, ['Format', 'Paragraph styles', 'Borders and shading'])).click();
  const dialog = page.getByRole('dialog', { name: 'Borders and shading' });
  await expect(dialog.getByRole('button', { name: 'Between' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await dialog.getByRole('combobox', { name: 'Border width' }).selectOption('2');
  await dialog.getByRole('combobox', { name: 'Border dash' }).selectOption('dashed');
  await dialog.getByRole('textbox', { name: 'Paragraph padding' }).fill('6');
  await dialog.getByRole('button', { name: 'Background colour' }).click();
  await page
    .getByRole('button', { name: /yellow/i })
    .first()
    .click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(body).toBeFocused();

  // One box: the upper keeps its top, the lower its bottom; both shaded; the third untouched.
  await expect(first).toHaveCSS('border-top-style', 'dashed');
  // 2 pt; the browser snaps a border to whole pixels.
  await expect(first).toHaveCSS('border-top-width', '2px');
  await expect(first).toHaveCSS('padding-top', '8px');
  await expect(first).toHaveCSS('border-bottom-width', '0px');
  await expect(second).toHaveCSS('border-top-width', '0px');
  await expect(second).toHaveCSS('border-bottom-style', 'dashed');
  await expect(first).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(third).toHaveCSS('border-top-width', '0px');
  await expect(third).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('p').first()).toHaveCSS('border-top-style', 'dashed');
  await expect(body.locator('p').nth(1)).toHaveCSS('border-bottom-style', 'dashed');

  // Reset takes it all away.
  await body.locator('p').first().click();
  await (await officeMenuItem(page, ['Format', 'Paragraph styles', 'Borders and shading'])).click();
  await expect(dialog.getByRole('combobox', { name: 'Border width' })).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(body.locator('p').first()).toHaveCSS('border-top-width', '0px');
  await expect(body.locator('p').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expectNoPageErrors(pageErrors);
});
