import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// File > Details and File > Move to trash (docs/specs/034-text-documents/files-and-print.md "Details", "Trash"):
// Details says who owns the document, where it is, its dates, format, size and counts, read only; Move to trash asks
// nothing, goes to the Explorer, which says the document was deleted with an Undo that brings it back.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('Details says the document’s facts, and Move to trash bins it with an Undo', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('The cat sat on the mat.');

  await (await officeMenuItem(page, ['File', 'Details'])).click();
  const dialog = page.getByRole('dialog', { name: 'Details' });
  await expect(dialog).toBeVisible();
  const value = (row: string) =>
    dialog
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: row, exact: true }) })
      .getByRole('cell');
  await expect(value('Owner')).toHaveText('You');
  await expect(value('Location')).toHaveText(/^My Documents/);
  await expect(value('Created')).toHaveText(/\d{4}/);
  await expect(value('Modified')).toHaveText(/\d{4}/);
  await expect(value('Format')).toHaveText('OpenDocument text (.odt)');
  await expect(value('Size')).toHaveText(/ KB$/);
  await expect(value('Pages')).toHaveText('1');
  await expect(value('Words')).toHaveText('6');
  await expect(value('Characters')).toHaveText('23');
  await expect(value('Characters excluding spaces')).toHaveText('18');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('details.png') });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(BODY)).toBeFocused();

  const name = (await page.getByRole('textbox', { name: 'Rename' }).inputValue()).trim();
  await (await officeMenuItem(page, ['File', 'Move to trash'])).click();
  await page.waitForURL(/\/explorer\//);
  const deleted = page.getByText(`“${name}” deleted`);
  await expect(deleted).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('moved-to-trash.png') });
  await page.getByRole('button', { name: `Undo: restore “${name}”` }).click();
  await expect(page.getByText(`“${name}” restored`)).toBeVisible();
  expectNoPageErrors(pageErrors);
});
