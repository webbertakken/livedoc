import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Spacing and keep rules on a text document (docs/specs/034-text-documents/text-and-paragraphs.md "Spacing and keep
// rules"): line spacing from the toolbar's control and Format, space added and removed, Custom spacing and the keep
// rules set a paragraph's own formatting, drawn on the page and kept after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('paragraphs are spaced, and keep rules switched, kept after a reload', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const first = body.locator('p').first();

  await body.click();
  await page.keyboard.type('Spaced out');
  await expect(first).toHaveCSS('line-height', '16.8667px');

  // Double from the toolbar's Line & paragraph spacing control.
  await toolbar.getByRole('button', { name: 'Line & paragraph spacing' }).click();
  const menu = page.getByRole('menu', { name: 'Line & paragraph spacing' });
  await menu.getByRole('menuitemradio', { name: 'Double' }).click();
  await expect(body).toBeFocused();
  await expect(first).toHaveCSS('line-height', '29.3333px');

  // Add space after, then the item offers to remove it.
  await (
    await officeMenuItem(page, ['Format', 'Line & paragraph spacing', 'Add space after paragraph'])
  ).click();
  await expect(first).toHaveCSS('margin-bottom', '16px');
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Format' })
    .click();
  await page.getByRole('menuitem', { name: 'Line & paragraph spacing', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Remove space after paragraph' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Custom spacing: 1.5 lines, 6 pt before.
  await (
    await officeMenuItem(page, ['Format', 'Line & paragraph spacing', 'Custom spacing'])
  ).click();
  const dialog = page.getByRole('dialog', { name: 'Custom spacing' });
  await expect(dialog.getByRole('textbox', { name: 'Line spacing' })).toHaveValue('2');
  await dialog.getByRole('textbox', { name: 'Line spacing' }).fill('1.5');
  await dialog.getByRole('textbox', { name: 'Before' }).fill('6');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await expect(first).toHaveCSS('line-height', '22px');
  await expect(first).toHaveCSS('margin-top', '8px');

  // Keep lines together on; prevent single lines off.
  await body.click();
  await (
    await officeMenuItem(page, ['Format', 'Line & paragraph spacing', 'Keep lines together'])
  ).click();
  await expect(first).toHaveCSS('break-inside', 'avoid');
  await (
    await officeMenuItem(page, ['Format', 'Line & paragraph spacing', 'Prevent single lines'])
  ).click();
  await expect(first).toHaveCSS('orphans', '1');

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('p').first()).toHaveCSS('line-height', '22px');
  await expect(body.locator('p').first()).toHaveCSS('margin-bottom', '16px');
  await expect(body.locator('p').first()).toHaveCSS('break-inside', 'avoid');
  expectNoPageErrors(pageErrors);
});
