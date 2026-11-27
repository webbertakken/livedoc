import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Conversion (docs/specs/034-text-documents/standard-mapping.md "Conversion", files-and-print.md "Downloading"): an
// OpenDocument file downloads as Word after the dialog lists what Word cannot hold, keeping its own format; File >
// Convert to Word format changes it, and one undo puts it back.

const BODY = '[role="textbox"][aria-label="Document body"]';
const FILE = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/libreoffice/features.odt',
);

test('an OpenDocument file downloads as Word, converts, and undoes the conversion', async ({
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
  await expect(page.getByText('.ODT', { exact: true })).toBeVisible();

  // Download as Word asks first, listing what the .docx cannot hold.
  await (await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)'])).click();
  const asking = page.getByRole('dialog', { name: 'Download as Word?' });
  await expect(asking.getByText('The .docx file cannot hold:')).toBeVisible();
  await expect(asking.getByRole('listitem').first()).toContainText('kept from the original file');
  await page.screenshot({ path: test.info().outputPath('download-as-word.png') });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    asking.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('features.docx');
  const saved = test.info().outputPath('features.docx');
  await download.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok && read.document.format).toBe('ooxml');
  // The document keeps its own format.
  await expect(page.getByText('.ODT', { exact: true })).toBeVisible();

  // File > Convert to Word format: the same list, then Convert; the badge says .DOCX.
  await (await officeMenuItem(page, ['File', 'Convert to Word format'])).click();
  const converting = page.getByRole('dialog', { name: 'Convert to Word?' });
  await expect(converting.getByText('The .docx file cannot hold:')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('convert-to-word.png') });
  await converting.getByRole('button', { name: 'Convert' }).click();
  await expect(converting).toHaveCount(0);
  await expect(page.getByText('.DOCX', { exact: true })).toBeVisible();
  await expect(page.locator(BODY)).toContainText('Heading one');
  await page.screenshot({ path: test.info().outputPath('converted.png') });

  // One undo takes the conversion back: OpenDocument again, the writing as it was.
  await (await officeMenuItem(page, ['Edit', 'Undo'])).click();
  await expect(page.getByText('.ODT', { exact: true })).toBeVisible();
  await expect(page.locator(BODY)).toContainText('Heading one');
  expectNoPageErrors(pageErrors);
});
