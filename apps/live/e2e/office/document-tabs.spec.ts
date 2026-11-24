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
  await expect(page).toHaveURL(/#tab=t\.[a-z0-9]{12}$/);
  await body.click();
  await page.keyboard.type('In the second tab');

  await (await officeMenuItem(page, ['View', 'Show outline'])).click();
  const tabs = page.getByRole('list', { name: 'Document tabs' });
  await expect(tabs.getByRole('button')).toHaveText(['Tab 1', 'Tab 2']);
  await expect(tabs.getByRole('button', { name: 'Tab 2' })).toHaveAttribute('aria-current', 'page');

  await body.click();
  await page.keyboard.press('Control+Shift+PageUp');
  await expect(body).toHaveText('In the first tab');
  await expect(tabs.getByRole('button', { name: 'Tab 1' })).toHaveAttribute('aria-current', 'page');

  await tabs.getByRole('button', { name: 'Tab 2' }).click();
  await expect(body).toHaveText('In the second tab');

  // Kept, and opened on the tab the address names.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await expect(body).toHaveText('In the second tab');
  expectNoPageErrors(pageErrors);
});
