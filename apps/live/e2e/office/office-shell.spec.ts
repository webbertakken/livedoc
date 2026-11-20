import { expect, expectNoPageErrors, test } from '../fixtures';

// The office shell on a text document (docs/specs/004-interface-design/office-shell.md "Menu bar", "Tool finder",
// "Shortcut layer", "Keyboard shortcuts dialog"; docs/specs/034-text-documents/keyboard-shortcuts.md): the menus
// open and move from the keyboard, the tool finder runs what it finds, Ctrl+Z undoes through the shortcut layer, and
// Ctrl+/ lists the shortcuts.

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
  await expect(page.getByRole('menuitem', { name: 'New', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open', exact: true })).toBeFocused();
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

  // The toolbar (office-shell.md "Toolbar"): Undo from it, then the zoom typed to 150%, kept across a reload.
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await toolbar.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(BODY)).toHaveText('');
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  const page100 = (await page.locator(BODY).boundingBox())!.width;
  const zoomField = toolbar.getByRole('combobox', { name: 'Zoom' });
  await zoomField.fill('150');
  await zoomField.press('Enter');
  await expect(zoomField).toHaveValue('150%');
  await expect
    .poll(async () => (await page.locator(BODY).boundingBox())!.width)
    .toBeCloseTo(page100 * 1.5, 0);
  await page.screenshot({ path: test.info().outputPath('toolbar.png') });
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('150%');

  // The editing mode (review.md "Editing modes"): Viewing makes the writing read only and the toolbar a Viewer's;
  // the shortcut brings Editing back.
  await page.getByRole('button', { name: 'Mode: Editing' }).click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();
  await expect(page.locator(BODY)).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByRole('toolbar', { name: 'Toolbar' }).getByRole('button', { name: 'Undo' }),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('viewing.png') });
  await page.locator(BODY).click();
  await page.keyboard.press('ControlOrMeta+Alt+Shift+z');
  await expect(page.getByRole('button', { name: 'Mode: Editing' })).toBeVisible();
  await expect(page.locator(BODY)).toHaveAttribute('contenteditable', 'true');

  // The Keyboard shortcuts dialog (office-shell.md "Keyboard shortcuts dialog"): Ctrl+/ opens it on its search,
  // typing filters, Escape clears the search, then closes it and the writing has the keyboard back.
  await page.keyboard.press('ControlOrMeta+/');
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  const shortcutSearch = shortcuts.getByRole('searchbox', { name: 'Search keyboard shortcuts' });
  await expect(shortcutSearch).toBeFocused();
  await expect(shortcuts.getByRole('region', { name: 'Common actions' })).toBeVisible();
  await shortcutSearch.fill('redo');
  await expect(shortcuts.getByRole('region')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('shortcuts.png') });
  await page.keyboard.press('Escape');
  await expect(shortcutSearch).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(shortcuts).toHaveCount(0);
  await expect(page.locator(BODY)).toBeFocused();

  // The context menu (office-shell.md "Context menus"): a right-click on the selection keeps it, and Delete removes it.
  await page.locator(BODY).click();
  await page.keyboard.type('Gone soon');
  await page.keyboard.press('ControlOrMeta+a');
  await page.locator(BODY).click({ button: 'right' });
  const context = page.getByRole('menu', { name: 'Context menu' });
  await expect(context.getByRole('menuitem', { name: 'Cut' })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('context-menu.png') });
  await context.getByRole('menuitem', { name: /^Delete/ }).click();
  await expect(context).toHaveCount(0);
  await expect(page.locator(BODY)).toHaveText('');
  await expect(page.locator(BODY)).toBeFocused();

  // F6 between the parts (office-shell.md "Behaviour"): from the writing to the tab strip, round to the title row,
  // the menu bar, the toolbar, and the writing again.
  await page.keyboard.press('F6');
  await expect(page.getByRole('button', { name: 'Add tab' })).toBeFocused();
  await page.keyboard.press('F6');
  await expect(page.getByRole('link', { name: 'Explorer' })).toBeFocused();
  await page.keyboard.press('F6');
  await expect(bar.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('F6');
  await expect(page.getByRole('toolbar', { name: 'Toolbar' }).locator(':focus')).toHaveCount(1);
  await page.keyboard.press('F6');
  await expect(page.locator(BODY)).toBeFocused();

  // A narrow window moves the controls that do not fit behind More.
  await page.setViewportSize({ width: 700, height: 860 });
  await page.getByRole('button', { name: 'More' }).click();
  await expect(
    page
      .getByRole('toolbar', { name: 'More tools' })
      .getByRole('button', { name: 'Clear formatting' }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('toolbar-more.png') });
  expectNoPageErrors(pageErrors);
});
