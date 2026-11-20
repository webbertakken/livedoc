import { expect, expectNoPageErrors, test } from '../fixtures';

// The office shell on a text document (docs/specs/004-interface-design/office-shell.md "Menu bar", "Tool finder",
// "Shortcut layer"; docs/specs/034-text-documents/keyboard-shortcuts.md): the menus open and move from the keyboard,
// the tool finder runs what it finds, and Ctrl+Z undoes through the shortcut layer.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('the menus, the tool finder and the shortcut layer work a text document', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const bar = page.getByRole('menubar', { name: 'Menu bar' });
  await expect(bar.getByRole('menuitem')).toHaveText([
    'File',
    'Edit',
    'View',
    'Insert',
    'Format',
    'Tools',
    'Extensions',
    'Help',
  ]);

  // A menu opens on press, the next one with Right, and a dimmed item names what it waits on.
  await bar.getByRole('menuitem', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Make a copy' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bar.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('menuitem', { name: 'Undo' })).toBeFocused();
  await expect(page.getByRole('menuitem', { name: 'Cut' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(bar.getByRole('menuitem', { name: 'Edit' })).toBeFocused();

  // Typing, then Ctrl+Z through the layer, then Redo from the tool finder.
  await page.locator(BODY).click();
  await page.keyboard.type('Written once');
  await expect(page.locator(BODY)).toHaveText('Written once');
  await page.waitForTimeout(600);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator(BODY)).toHaveText('');
  await page.keyboard.press('Alt+/');
  const finder = page.getByRole('combobox', { name: 'Search the menus' });
  await expect(finder).toBeFocused();
  await finder.fill('redo');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(finder).toHaveCount(0);
  await expect(page.locator(BODY)).toHaveText('Written once');
  expectNoPageErrors(pageErrors);
});
