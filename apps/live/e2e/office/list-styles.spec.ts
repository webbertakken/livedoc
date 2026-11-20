import { expect, expectNoPageErrors, test } from '../fixtures';

// List styles and numbering on a text document (docs/specs/034-text-documents/lists.md "List styles", "Numbering"):
// a preset from the Numbered list's grid restyles the list, Restart numbering from the context menu starts it again at
// a number, Continue previous numbering takes that back, a checklist without strikethrough; kept after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('list styles, restart and continue numbering, kept after a reload', async ({
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
  const markers = body.locator('.text-document-list-marker');

  // A numbered list of three, the second a level in.
  await body.click();
  await page.keyboard.press('Control+Shift+7');
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('One a');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Two');
  await expect(markers).toHaveText(['1.', 'a.', '2.']);

  // The grid: opened from the chevron on the style in force; the outline preset restyles every item.
  await toolbar.getByRole('button', { name: 'Numbered list styles' }).click();
  const grid = page.getByRole('menu', { name: 'Numbered list styles' });
  await expect(grid.getByRole('menuitemradio', { name: '1. a. i.' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(grid.getByRole('menuitemradio', { name: '1. a. i.' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(grid.getByRole('menuitemradio', { name: '1. 1.1. 1.1.1.' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(grid).toBeHidden();
  await expect(markers).toHaveText(['1.', '1.1.', '2.']);
  await expect(body).toBeFocused();

  // Restart numbering at "Two", from the context menu, at 5.
  await body.locator('p', { hasText: 'Two' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Restart numbering' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restart numbering' });
  const startAt = dialog.getByRole('textbox', { name: 'Start at' });
  await expect(startAt).toHaveValue('1');
  await startAt.fill('40000');
  await expect(dialog.getByText('Enter a whole number from 0 to 32767.')).toBeVisible();
  await startAt.fill('5');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(markers).toHaveText(['1.', '1.1.', '5.']);

  // Continue previous numbering takes it back.
  await body.locator('p', { hasText: 'Two' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Continue previous numbering' }).click();
  await expect(markers).toHaveText(['1.', '1.1.', '2.']);

  // Off a list, the context menu has neither.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain');
  await body.locator('p', { hasText: 'Plain' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Restart numbering' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A checklist without strikethrough: ticked, not struck.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Milk');
  await toolbar.getByRole('button', { name: 'Checklist styles' }).click();
  await page
    .getByRole('menu', { name: 'Checklist styles' })
    .getByRole('menuitemradio', { name: 'Without strikethrough' })
    .click();
  const box = body.getByRole('checkbox', { name: 'Milk' });
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(body.locator('p', { hasText: 'Milk' })).toHaveCSS('text-decoration-line', 'none');
  await expect(toolbar.getByRole('button', { name: 'Checklist', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Kept after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body.locator('.text-document-list-marker')).toHaveText(['1.', '1.1.', '2.', '']);
  await expect(body.locator('p', { hasText: 'Milk' })).toHaveCSS('text-decoration-line', 'none');
  expectNoPageErrors(pageErrors);
});
