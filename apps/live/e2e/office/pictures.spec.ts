import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pictures, readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Pictures in line (docs/specs/034-text-documents/objects.md "In the editor", "In the formats"): a Word file's pictures
// are drawn at their size from their media, read by their alternative text; one Word kept (a metafile) stays kept;
// the file leaves holding the same pictures. Their bytes go to the opener's gallery (objects.md "Where the bytes live"),
// the document placing them (images.md "Reference index"), and leave read back from it, a JPEG without its metadata.

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

  // The PNG and the JPEG are the opener's gallery images now, the document placing both once its outbox drains.
  const headers = await pageOwnerHeaders(page);
  const gallery = await page.evaluate(async (headers) => {
    const res = await fetch('/api/images', { headers });
    return ((await res.json()) as { images: { id: string; contentType: string }[] }).images;
  }, headers);
  expect(gallery.map((i) => i.contentType).sort()).toEqual(['image/jpeg', 'image/png']);
  const documentId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ headers, documentId }) => {
            const res = await fetch('/api/images/usage', { headers });
            const { usage } = (await res.json()) as { usage: Record<string, { id: string }[]> };
            return Object.entries(usage)
              .filter(([, documents]) => documents.some((d) => d.id === documentId))
              .map(([id]) => id)
              .sort();
          },
          { headers, documentId },
        ),
      { timeout: 20_000 },
    )
    .toEqual(gallery.map((i) => i.id).sort());

  // Downloaded, the same pictures; the PNG with the same bytes, the JPEG as the gallery keeps it.
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
    const shape = (document: typeof left.document) =>
      Pictures.ofDocument(document).map(({ media: _, ...picture }) => picture);
    expect(shape(left.document)).toEqual(shape(arrived.document));
    const parts = (document: typeof left.document) =>
      Pictures.heldMedia(document).map(([key, m]) => [
        m.part,
        m.mediaType === 'image/png' ? key : 'jpeg',
      ]);
    expect(parts(left.document)).toEqual(parts(arrived.document));
  }
  expectNoPageErrors(pageErrors);
});
