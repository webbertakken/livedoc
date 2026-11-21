import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Blocks, Paragraph, readTextDocumentFile, type Table } from '@livedoc/text-documents';
import type { Locator } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Tables drawn and typed in (docs/specs/034-text-documents/tables.md "In the editor"): a LibreOffice file's table opens
// with its cells in order, its merged cell across both columns, and its lines; typing in a cell, Enter making a second
// paragraph in it and Backspace at its start staying in it; downloaded, the cell holds what was typed.

const BODY = '[role="textbox"][aria-label="Document body"]';
const FILE = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/libreoffice/rich.odt',
);

const caretAtStart = async (paragraph: Locator) => {
  await paragraph.evaluate((p) => {
    const range = document.createRange();
    range.setStart(p.firstChild ?? p, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  // The editor reads the moved selection on the next selection change.
  await paragraph.page().waitForTimeout(100);
};

test('a table opens drawn, is typed in, and leaves holding what was typed', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(FILE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('rich');
  const body = page.locator(BODY);

  const table = body.locator('table.text-document-table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('td, th')).toHaveText(['Name', 'Value', 'Alpha', '1', 'Merged']);
  await expect(table.locator('td', { hasText: 'Merged' })).toHaveAttribute('colspan', '2');
  await expect(table.locator('col')).toHaveCount(2);
  const lined = await table
    .locator('td')
    .first()
    .evaluate((td) => getComputedStyle(td).borderTopStyle);
  expect(lined).not.toBe('none');
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('table-open.png') });

  // Typing at the end of "Alpha", a second paragraph in its cell, and Backspace at that paragraph's start joining back.
  const alpha = table.locator('td p', { hasText: 'Alpha' });
  await alpha.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' beta');
  await page.keyboard.press('Enter');
  await page.keyboard.type('gamma');
  const cell = table.locator('td').filter({ hasText: 'Alpha beta' });
  await expect(cell.locator('p')).toHaveText(['Alpha beta', 'gamma']);
  // The cell is narrow and its writing wraps: the caret goes to a paragraph's start by the selection, not Home.
  await caretAtStart(cell.locator('p').nth(1));
  await page.keyboard.press('Backspace');
  await expect(cell.locator('p')).toHaveText(['Alpha betagamma']);
  await caretAtStart(cell.locator('p').first());
  await page.keyboard.press('Backspace');
  await expect(table.locator('td, th')).toHaveText([
    'Name',
    'Value',
    'Alpha betagamma',
    '1',
    'Merged',
  ]);
  await page.screenshot({ path: test.info().outputPath('table-typed.png') });

  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('rich.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const left = read.document.body.find((b): b is Table => b.type === 'table');
    expect(Blocks.paragraphs(left ? [left] : []).map(Paragraph.text)).toEqual([
      'Name',
      'Value',
      'Alpha betagamma',
      '1',
      'Merged',
    ]);
  }
  expectNoPageErrors(pageErrors);
});
