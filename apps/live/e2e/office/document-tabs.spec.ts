import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline": Insert > Tab adds Tab 2 and
// shows it, its own body, named in the address; the outline lists both, the shown one marked; Ctrl+Shift+Page Up goes
// back to the first tab's writing; a press on a tab shows it; the address opens the tab it names after a reload.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('document tabs: added, shown one at a time, stepped through and opened by their link', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('In the first tab');

  await (await officeMenuItem(page, ['Insert', 'Tab'])).click();
  await expect(body).toHaveText('');
  await expect(page).toHaveURL(/[?&]doctab=t\.[a-z0-9]{12}(#|$)/);
  await body.click();
  await page.keyboard.type('In the second tab');

  await (await officeMenuItem(page, ['View', 'Show outline'])).click();
  const tabs = page.getByRole('list', { name: 'Document tabs' });
  // Each tab's row, without its Tab options button.
  await expect(tabs.locator('li > div > button:not([aria-haspopup])')).toHaveText([
    'Tab 1',
    'Tab 2',
  ]);
  await expect(tabs.getByRole('button', { name: 'Tab 2', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await body.click();
  await page.keyboard.press('Control+Shift+PageUp');
  await expect(body).toHaveText('In the first tab');
  await expect(tabs.getByRole('button', { name: 'Tab 1', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await tabs.getByRole('button', { name: 'Tab 2', exact: true }).click();
  await expect(body).toHaveText('In the second tab');

  // Kept, and opened on the tab the address names.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body).toHaveText('In the second tab');
  expectNoPageErrors(pageErrors);
});

// "A tab's menu": renamed in place, a subtab added and outdented, a copy made, one deleted after asking.
test('a document tab’s menu renames, nests, copies and deletes it', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Plan writing');
  await (await officeMenuItem(page, ['View', 'Show outline'])).click();
  const tabs = page.getByRole('list', { name: 'Document tabs' });
  // Each tab's row, without its Tab options button.
  const tabRows = tabs.locator('li > div > button:not([aria-haspopup])');
  const menuOf = async (name: string, item: string) => {
    await tabs.getByRole('button', { name: `Tab options: ${name}` }).click();
    await page
      .getByRole('menu', { name: 'Tab options' })
      .getByRole('menuitem', { name: item })
      .click();
  };

  await menuOf('Tab 1', 'Rename');
  const field = tabs.getByRole('textbox', { name: 'Tab name' });
  await expect(field).toBeFocused();
  await field.fill('Plan');
  await field.press('Enter');
  await expect(tabs.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();

  await menuOf('Plan', 'Add subtab');
  await expect(tabs.getByRole('button', { name: 'Tab 2', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(body).toHaveText('');
  await menuOf('Tab 2', 'Outdent');
  await menuOf('Plan', 'Duplicate');
  await expect(tabRows).toHaveText(['Plan', 'Copy of Plan', 'Tab 2']);
  await expect(body).toHaveText('Plan writing');

  await menuOf('Copy of Plan', 'Delete');
  const dialog = page.getByRole('dialog', { name: 'Delete "Copy of Plan"?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(tabRows).toHaveText(['Plan', 'Tab 2']);
  await expect(tabs.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expectNoPageErrors(pageErrors);
});

// "A tab's menu" (Dragging) and "The outline": View > Show tabs & outlines opens the outline; a tab dragged into
// another becomes its subtab, one dragged to the top of a row goes before it; the item closes the outline again.
test('document tabs dragged in the outline, opened from Show tabs & outlines', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await (await officeMenuItem(page, ['Insert', 'Tab'])).click();
  await (await officeMenuItem(page, ['Insert', 'Tab'])).click();

  await (await officeMenuItem(page, ['View', 'Show tabs & outlines'])).click();
  const tabs = page.getByRole('list', { name: 'Document tabs' });
  await expect(tabs).toBeVisible();
  const row = (name: string) => tabs.getByRole('button', { name, exact: true });
  const tabRows = tabs.locator('li > div > button:not([aria-haspopup])');
  await expect(tabRows).toHaveText(['Tab 1', 'Tab 2', 'Tab 3']);

  // Into: the middle of Tab 1's row.
  await row('Tab 3').dragTo(row('Tab 1'));
  await expect(tabRows).toHaveText(['Tab 1', 'Tab 3', 'Tab 2']);
  await expect(row('Tab 3')).toHaveCSS('padding-left', '20px');

  // Before: the top of Tab 1's row.
  await row('Tab 2').dragTo(row('Tab 1'), { targetPosition: { x: 40, y: 2 } });
  await expect(tabRows).toHaveText(['Tab 2', 'Tab 1', 'Tab 3']);
  await expect(row('Tab 2')).toHaveCSS('padding-left', '8px');

  await (await officeMenuItem(page, ['View', 'Show tabs & outlines'])).click();
  await expect(tabs).toBeHidden();
  expectNoPageErrors(pageErrors);
});

// "The summary": an Editor adds it from the outline, Escape keeps the old text, Ctrl+Enter keeps what was typed, and it
// is there after a reload.
test('the outline’s summary is written in place and kept', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await (await officeMenuItem(page, ['View', 'Show outline'])).click();
  const outline = page.getByRole('region', { name: 'Summary' });

  await outline.getByRole('button', { name: 'Add summary' }).click();
  const field = outline.getByRole('textbox', { name: 'Summary' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Dropped');
  await page.keyboard.press('Escape');
  await expect(field).toBeHidden();
  await expect(outline.getByRole('button', { name: 'Add summary' })).toBeVisible();

  await outline.getByRole('button', { name: 'Add summary' }).click();
  await page.keyboard.type('Where the plan stands.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Who reads it.');
  await page.keyboard.press('Control+Enter');
  await expect(outline.getByText('Where the plan stands.')).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Edit summary' })).toBeVisible();

  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(
    'Where the plan stands.',
  );
  expectNoPageErrors(pageErrors);
});
