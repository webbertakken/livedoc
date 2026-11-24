import { readFileSync } from 'node:fs';
import { readTextDocumentFile, type Paragraph, type Table } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert > Building blocks (docs/specs/034-text-documents/objects.md "Building blocks"): meeting notes go in as a dated
// heading, attendees, notes with a bullet and action items with a checklist item, the caret after the date; a tracker
// goes in as a table whose title and names rows are header rows; one undo takes a block away; the file holds them as
// plain paragraphs and tables.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('building blocks go in at the caret and leave as plain paragraphs and tables', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();

  await (await officeMenuItem(page, ['Insert', 'Building blocks', 'Meeting notes'])).click();
  const paragraphs = body.locator(':scope > p');
  await expect(paragraphs.nth(0)).toHaveText(/^\S.* \| $/);
  await expect(paragraphs.nth(1)).toHaveText('Attendees: ');
  await expect(paragraphs.nth(2)).toHaveText('Notes');
  await expect(paragraphs.nth(4)).toHaveText('Action items');
  await expect(body.getByRole('checkbox')).toHaveCount(1);
  // The caret waits after the date for the meeting's name.
  await page.keyboard.type('Weekly sync');
  await expect(paragraphs.nth(0)).toHaveText(/ \| Weekly sync$/);

  // A tracker after the action item: its title and names rows are column headers.
  await body.focus();
  await page.keyboard.press('Control+End');
  await (await officeMenuItem(page, ['Insert', 'Building blocks', 'Review tracker'])).click();
  const table = body.locator('table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('tr').nth(0)).toHaveText('Review tracker');
  await expect(table.locator('tr').nth(1).locator('th')).toHaveText([
    'Reviewer',
    'Status',
    'Notes',
  ]);
  await expect(table.locator('tr').nth(5)).toContainText('Approved');
  // The caret writes in the first reviewer's cell.
  await page.keyboard.type('Ada');
  await expect(table.locator('tr').nth(2).locator('td').nth(0)).toHaveText('Ada');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('building-blocks.png') });

  // The file holds the tracker as a table of two header rows, the notes as headings and lists (the new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('blocks.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const written = read.document.body.find((b): b is Table => b.type === 'table');
    expect(written?.headerRows).toBe(2);
    expect(written?.rows).toHaveLength(6);
    const notes = read.document.body.filter((b): b is Paragraph => b.type === 'paragraph');
    expect(notes.filter((p) => p.list).length).toBeGreaterThanOrEqual(2);
  }

  // Undo takes the typing away, then the tracker, the meeting notes staying.
  await body.focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(table).toHaveCount(0);
  await expect(paragraphs.nth(4)).toHaveText('Action items');
  expectNoPageErrors(pageErrors);
});
