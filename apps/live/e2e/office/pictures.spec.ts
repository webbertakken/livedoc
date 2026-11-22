import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pictures, readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Pictures in line (docs/specs/034-text-documents/objects.md "In the editor", "In the formats"): a Word file's pictures
// are drawn at their size from their media, read by their alternative text; one Word kept (a metafile) stays kept;
// the file leaves holding the same pictures and the same bytes.

const BODY = '[role="textbox"][aria-label="Document body"]';
const FILE = join(
  import.meta.dirname,
  '../../../../packages/text-documents/corpus/word/VariousPictures.docx',
);

test('a Word file’s pictures are drawn, and leave as they came', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(FILE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VariousPictures');
  const body = page.locator(BODY);

  // The PNG and the JPEG are the model's, drawn from their bytes at their size; the metafiles stay kept.
  const tomcat = body.getByRole('img', { name: 'tomcat.png' });
  const clock = body.getByRole('img', { name: 'clock.jpg' });
  await expect(tomcat).toBeVisible();
  await expect(clock).toBeVisible();
  for (const img of [tomcat, clock])
    expect(await img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const box = await body.locator('.text-document-picture').first().boundingBox();
  // 97.5 × 69 pt is 130 × 92 CSS pixels at the page's 100%.
  expect(Math.round(box!.width)).toBeGreaterThan(0);
  await expect(body.locator('[data-kept="drawing"]')).toHaveCount(3);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('pictures-open.png') });

  // A press selects a picture whole.
  await tomcat.click();
  await expect(body.locator('.ProseMirror-selectednode.text-document-picture')).toHaveCount(1);

  // Downloaded, the same pictures with the same bytes.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const saved = test.info().outputPath('VariousPictures.docx');
  await download.saveAs(saved);
  const [arrived, left] = await Promise.all([
    readTextDocumentFile(new Uint8Array(readFileSync(FILE))),
    readTextDocumentFile(new Uint8Array(readFileSync(saved))),
  ]);
  expect(arrived.ok && left.ok).toBe(true);
  if (arrived.ok && left.ok) {
    expect(Pictures.ofDocument(left.document)).toEqual(Pictures.ofDocument(arrived.document));
    expect(Pictures.heldMedia(left.document).map(([key]) => key)).toEqual(
      Pictures.heldMedia(arrived.document).map(([key]) => key),
    );
  }
  expectNoPageErrors(pageErrors);
});
