import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert > Symbols > Special characters (docs/specs/034-text-documents/objects.md "Special characters"): the dialog
// browses Unicode by category and block and searches by name or codepoint; a press puts the character in at the caret
// and the dialog stays open; each is one undo step. List options > More bullets (lists.md "List options") opens the
// same dialog, and a press makes the character the item's bullet.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('special characters go in at the caret, and one becomes a bullet', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Go ');

  await (await officeMenuItem(page, ['Insert', 'Symbols', 'Special characters'])).click();
  const dialog = page.getByRole('dialog', { name: 'Insert special characters' });
  const grid = dialog.getByRole('group', { name: 'Characters' });
  // Opens on Symbol, Arrows.
  await expect(grid.getByRole('button', { name: 'Rightwards arrow', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Category' })).toHaveValue('Symbol');
  await expect(dialog.getByRole('combobox', { name: 'Block' })).toHaveValue('Arrows');
  await grid.getByRole('button', { name: 'Rightwards arrow', exact: true }).hover();
  await expect(dialog.locator('[data-special-character-preview]')).toContainText('U+2192');
  await page.screenshot({ path: test.info().outputPath('special-characters.png') });

  await grid.getByRole('button', { name: 'Rightwards arrow', exact: true }).click();
  await expect(dialog).toBeVisible();
  // A codepoint searched, then a name.
  const search = dialog.getByRole('searchbox', { name: 'Search by name or codepoint' });
  await search.fill('U+00A9');
  await grid.getByRole('button', { name: 'Copyright sign', exact: true }).click();
  await search.fill('black star');
  // Every word typed starts a word of the name: Black star first, in codepoint order.
  await expect(grid.getByRole('button').first()).toHaveAccessibleName('Black star');
  await page.screenshot({ path: test.info().outputPath('special-characters-search.png') });
  // Escape clears the search first, then closes the dialog.
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(dialog).toBeVisible();
  await search.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(body.locator(':scope > p').first()).toHaveText('Go →©');

  // Each press is one undo step; the caret writes on after the characters.
  await page.keyboard.press('Control+z');
  await expect(body.locator(':scope > p').first()).toHaveText('Go →');
  await page.keyboard.type('!');
  await expect(body.locator(':scope > p').first()).toHaveText('Go →!');

  // More bullets: the character becomes the item's bullet.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Milk');
  await page.keyboard.press('Control+Shift+8');
  const markers = body.locator('.text-document-list-marker');
  await expect(markers).toHaveText(['●']);
  await (
    await officeMenuItem(page, ['Format', 'Bullets & numbering', 'List options', 'More bullets'])
  ).click();
  await expect(dialog).toBeVisible();
  await search.fill('black star');
  await grid.getByRole('button', { name: 'Black star', exact: true }).click();
  await expect(markers).toHaveText(['★']);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  // The bullet is the marker, drawn before the item, never text of the writing.
  await expect(body.locator(':scope > p').nth(1)).toHaveText('★Milk');
  await expect(markers).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
