import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { libreOfficeConvert } from './libreoffice';
import { officeMenuItem } from './office-menus';

// A Word file through the room (docs/specs/034-text-documents/live-editing-and-storage.md "The layout",
// text-document.md "The format it is in"): opened from the File menu it is held in OOXML, shows its formatting and
// what it kept, and leaves as a .docx holding the same model, which LibreOffice reads.

const BODY = '[role="textbox"][aria-label="Document body"]';
const FILE = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/libreoffice/features.docx',
);

test('a Word file opens with its formatting and leaves as the same .docx', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(FILE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('features');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);

  // Held in OOXML, and says so; its bold runs are bold on the page.
  await expect(page.getByText('.DOCX', { exact: true })).toBeVisible();
  const bold = body.locator('span[style*="font-weight: 700"]').first();
  await expect(bold).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('word-file-open.png') });

  // Downloaded as the format it is held in: the same model, read by LibreOffice too.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  expect(download.suggestedFilename()).toBe('features.docx');
  const saved = test.info().outputPath('features.docx');
  await download.saveAs(saved);
  const [arrived, left] = await Promise.all([
    readTextDocumentFile(new Uint8Array(readFileSync(FILE))),
    readTextDocumentFile(new Uint8Array(readFileSync(saved))),
  ]);
  expect(arrived.ok && left.ok).toBe(true);
  if (arrived.ok && left.ok) {
    expect(left.document.body).toEqual(arrived.document.body);
    expect(left.document.styles).toEqual(arrived.document.styles);
  }
  expect(libreOfficeConvert(saved, 'txt:Text').toString('utf8').length).toBeGreaterThan(0);
  expectNoPageErrors(pageErrors);
});
