import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listZip } from '@livedoc/office-packages';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The exports (docs/specs/034-text-documents/files-and-print.md "Downloading"): a heading and a bulleted item typed
// here leave as a line each in Plain Text, as Markdown's heading and list item, and in Rich Text; a Word file's pictures, read back
// from the gallery, leave beside its Web Page and inside its EPUB.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a text document downloads as Plain Text, Markdown and Rich Text', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  // Heading 1 (Ctrl+Alt+1), then a bulleted item (Ctrl+Shift+8) with an italic word (Ctrl+I).
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('1');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await page.keyboard.type('Plan');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+8');
  await page.keyboard.type('First ');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('step');
  await expect(body.locator('em, [style*="italic"]').filter({ hasText: 'step' })).toHaveCount(1);

  const save = async (label: string, name: string) => {
    const item = await officeMenuItem(page, ['File', 'Download', label]);
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${name}$`));
    const path = test.info().outputPath(`export.${name}`);
    await download.saveAs(path);
    return readFileSync(path, 'utf8');
  };
  expect(await save('Plain Text (.txt)', 'txt')).toBe('Plan\n● First step\n');
  expect(await save('Markdown (.md)', 'md')).toBe('# Plan\n\n- First *step*\n');
  const rtf = await save('Rich Text Format (.rtf)', 'rtf');
  expect(rtf).toMatch(/^\{\\rtf1\\ansi/);
  expect(rtf).toMatch(/\\outlinelevel0\n\{[^ ]* Plan\}/);
  expect(rtf).toContain('\\i step}');
  expectNoPageErrors(pageErrors);
});

const PICTURES = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/word/VariousPictures.docx',
);

test('a text document’s pictures leave beside its Web Page and inside its EPUB', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(PICTURES);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VariousPictures');
  await expect(page.locator(BODY).getByRole('img', { name: 'tomcat.png' })).toBeVisible();

  const entries = async (label: string, name: string) => {
    const item = await officeMenuItem(page, ['File', 'Download', label]);
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    expect(download.suggestedFilename()).toBe(`VariousPictures.${name}`);
    const path = test.info().outputPath(`export.${name}`);
    await download.saveAs(path);
    const listed = listZip(new Uint8Array(readFileSync(path)));
    return listed.ok ? listed.entries.map((e) => e.name) : [];
  };
  const page1 = await entries('Web Page (.html, zipped)', 'zip');
  expect(page1[0]).toBe('VariousPictures.html');
  expect(page1.filter((n) => n.startsWith('images/'))).toEqual(['images/1.png', 'images/2.jpeg']);
  const book = await entries('EPUB Publication (.epub)', 'epub');
  expect(book.slice(0, 3)).toEqual(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf']);
  expect(book).toContain('OEBPS/chapter-1.xhtml');
  expect(book.filter((n) => n.includes('images/'))).toHaveLength(2);
  expectNoPageErrors(pageErrors);
});
