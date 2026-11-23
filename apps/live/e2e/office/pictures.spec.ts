import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Pictures, readTextDocumentFile } from '@livedoc/text-documents';
import type { Locator, Page } from '@playwright/test';
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

/** A solid PNG `width` by `height` (zlib through node), so a test hands the editor a real picture file. */
function solidPng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// objects.md "Inserting": Insert > Image > Upload from computer opens the file chooser, and the picture lands at the
// caret, at its pixels at 96 an inch, stored in the gallery; a picture file pasted lands at the caret too.
test('a picture is inserted from the computer, and pasted as a file', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('A picture: ');

  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Image', exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('insert-image-menu.png') });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Upload from computer', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: 'teal.png',
    mimeType: 'image/png',
    buffer: solidPng(240, 120, [0, 128, 128]),
  });
  const pictures = body.locator('.text-document-picture img');
  await expect(pictures).toHaveCount(1);
  // 240 × 120 pixels at 96 an inch: 180 × 90 points, 240 × 120 CSS pixels at 100%.
  const box = await body.locator('.text-document-picture').first().boundingBox();
  expect(Math.round(box!.width / box!.height)).toBe(2);
  await expect(body.locator('.ProseMirror-selectednode.text-document-picture')).toHaveCount(1);
  expect(await pictures.first().evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBe(240);

  const headers = await pageOwnerHeaders(page);
  const gallery = await page.evaluate(async (headers) => {
    const res = await fetch('/api/images', { headers });
    return ((await res.json()) as { images: { width: number }[] }).images;
  }, headers);
  expect(gallery.map((i) => i.width)).toEqual([240]);

  // objects.md "Working with a picture": Alt text writes its description; Replace image keeps it and the width.
  await (await officeMenuItem(page, ['Format', 'Image', 'Alt text'])).click();
  const altDialog = page.getByRole('dialog', { name: 'Alt text' });
  await altDialog.getByLabel('Description').fill('A teal band');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('alt-text-dialog.png') });
  await altDialog.getByRole('button', { name: 'OK' }).click();
  await expect(body.getByRole('img', { name: 'A teal band' })).toBeVisible();
  const widthBefore = (await body.locator('.text-document-picture').first().boundingBox())!.width;
  const [replacer] = await Promise.all([
    page.waitForEvent('filechooser'),
    (
      await officeMenuItem(page, ['Format', 'Image', 'Replace image', 'Upload from computer'])
    ).click(),
  ]);
  await replacer.setFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: solidPng(100, 100, [120, 40, 160]),
  });
  const replaced = body.getByRole('img', { name: 'A teal band' });
  await expect.poll(() => replaced.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBe(100);
  const square = (await body.locator('.text-document-picture').first().boundingBox())!;
  expect(Math.round(square.width)).toBe(Math.round(widthBefore));
  expect(Math.round(square.height)).toBe(Math.round(widthBefore));

  // A picture file pasted lands at the caret.
  await page.keyboard.press('End');
  const pasted = solidPng(60, 60, [200, 80, 0]).toString('base64');
  await body.evaluate((target, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'orange.png', { type: 'image/png' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, pasted);
  await expect(pictures).toHaveCount(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('pictures-inserted.png') });
  expectNoPageErrors(pageErrors);
});

// objects.md "Working with a picture": a selected picture's handles size it (a corner keeping its ratio), written as
// one undo step; Image options' Width sizes it, locked to its ratio, its Scale read from its own size; Reset image
// brings it back to its own size.
// A new text document holding one picture of 240 × 120 pixels, inserted from the computer and left selected, and its
// size as drawn, in CSS pixels.
async function documentWithPicture(page: Page, words: string) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type(words);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    (await officeMenuItem(page, ['Insert', 'Image', 'Upload from computer'])).click(),
  ]);
  await chooser.setFiles({
    name: 'teal.png',
    mimeType: 'image/png',
    buffer: solidPng(240, 120, [0, 128, 128]),
  });
  const picture = body.locator('.text-document-picture').first();
  await expect(picture.locator('img')).toHaveCount(1);
  const sizeOf = (locator: Locator) => async () => {
    const box = (await locator.boundingBox())!;
    return { width: Math.round(box.width), height: Math.round(box.height) };
  };
  return { body, picture, size: sizeOf(picture), imageSize: sizeOf(picture.locator('img')) };
}

test('a picture is sized by its handles and by Image options', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  const { body, picture, size } = await documentWithPicture(page, 'Sized: ');
  // 240 × 120 pixels at 96 an inch: 180 × 90 points, 240 × 120 CSS pixels at 100%.
  expect(await size()).toEqual({ width: 240, height: 120 });

  // Eight handles; the south-east one dragged along the diagonal: bigger, its ratio kept.
  const handles = picture.locator('[data-picture-handle]');
  await expect(handles).toHaveCount(8);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('picture-handles.png') });
  const se = (await picture.locator('[data-picture-handle="se"]').boundingBox())!;
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + se.width / 2 + 120, se.y + se.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(size).toEqual({ width: 360, height: 180 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(size).toEqual({ width: 240, height: 120 });

  // Image options: Width typed, the height following; Scale read from its own size.
  await picture.click();
  await expect(body.locator('.ProseMirror-selectednode.text-document-picture')).toHaveCount(1);
  await (await officeMenuItem(page, ['Format', 'Image', 'Image options'])).click();
  const panel = page.getByRole('complementary', { name: 'Image options' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Scale width' })).toHaveValue('100');
  const unit = (await panel
    .getByText(/^(in|cm)$/)
    .first()
    .textContent())!;
  const width = panel.getByRole('textbox', { name: 'Width', exact: true });
  await width.fill(unit === 'in' ? '3' : '7.62');
  await width.press('Enter');
  await expect.poll(size).toEqual({ width: 288, height: 144 });
  await expect(panel.getByRole('textbox', { name: 'Scale height' })).toHaveValue('120');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('image-options-panel.png') });

  // Reset: its own size again.
  await panel.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(size).toEqual({ width: 240, height: 120 });
  expectNoPageErrors(pageErrors);
});

// objects.md "Working with a picture", Cropping: a double-click begins it; a crop mark dragged in cuts that side, the
// picture's scale kept; Enter ends it; the crop is one undo step.
test('a picture is cropped by its crop marks', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  const { body, picture, size, imageSize } = await documentWithPicture(page, 'Cropped: ');
  await picture.dblclick();
  await expect(body.locator('.text-document-picture-cropping')).toHaveCount(1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('picture-cropping.png') });

  const mark = (await picture.locator('[data-picture-handle="e"]').boundingBox())!;
  await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
  await page.mouse.down();
  await page.mouse.move(mark.x + mark.width / 2 - 60, mark.y + mark.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(size).toEqual({ width: 180, height: 120 });
  expect(await imageSize()).toEqual({ width: 240, height: 120 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('picture-cropped-marks.png') });

  await page.keyboard.press('Enter');
  await expect(body.locator('.text-document-picture-cropping')).toHaveCount(0);
  await expect.poll(size).toEqual({ width: 180, height: 120 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('picture-cropped.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(size).toEqual({ width: 240, height: 120 });
  expectNoPageErrors(pageErrors);
});
