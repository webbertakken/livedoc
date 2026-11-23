import { readFileSync, writeFileSync } from 'node:fs';
import {
  Pictures,
  readTextDocumentFile,
  TextDocument,
  writeTextDocumentFile,
  type Picture,
} from '@livedoc/text-documents';
import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { solidPng } from './office-pictures';

// A picture's recolour and adjustments (docs/specs/034-text-documents/objects.md "The model", "In the formats", "In
// the editor"): a Word file's recoloured and adjusted pictures open as pictures, drawn through their colour filter in
// sRGB (a red field laid from black to blue by its luminance; greyscale, brightened and contrasted by Word's formula),
// their transparency as their opacity, and leave as they came.

const BODY = '[role="textbox"][aria-label="Document body"]';
const RED = solidPng(40, 40, [255, 0, 0]);

const picture = (alt: string, colouring: Partial<Picture>): Picture => ({
  type: 'picture',
  media: 'red',
  width: 30,
  height: 30,
  alt,
  props: {},
  ...colouring,
});

/** The colour at the middle of what the page draws for `img`, read back from a screenshot of it. */
async function middleColour(page: Page, img: Locator): Promise<number[]> {
  const shot = await img.screenshot();
  return page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1);
      return [data[0]!, data[1]!, data[2]!];
    },
    [...shot],
  );
}

const near = (actual: number[], expected: number[]) =>
  actual.every((v, i) => Math.abs(v - expected[i]!) <= 3);

test('a recoloured and adjusted picture is drawn so, and leaves as it came', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  const blank = TextDocument.blank({ format: 'ooxml', title: 'Recoloured' });
  const document: TextDocument = {
    ...blank,
    body: [
      {
        ...(blank.body[0] as Extract<TextDocument['body'][number], { type: 'paragraph' }>),
        inlines: [
          picture('Blue field', {
            recolour: { kind: 'duotone', dark: '#000000', light: '#4285f4' },
          }),
          picture('Grey field', {
            recolour: { kind: 'greyscale' },
            brightness: 20,
            contrast: 30,
            transparency: 25,
          }),
        ],
      },
    ],
    media: { red: { mediaType: 'image/png', bytes: new Uint8Array(RED) } },
  };
  const written = writeTextDocumentFile(document, 'docx');
  if (!written.ok) throw new Error(written.rejection);
  const file = test.info().outputPath('Recoloured.docx');
  writeFileSync(file, written.bytes);

  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recoloured');

  const body = page.locator(BODY);
  const blue = body.getByRole('img', { name: 'Blue field' });
  const grey = body.getByRole('img', { name: 'Grey field' });
  await expect(blue).toBeVisible();
  await expect(grey).toBeVisible();
  await expect(body.locator('[data-kept]')).toHaveCount(0);

  // Red's luminance (0.299) laid from black to #4285f4; greyscale 0.299, then Word's brightness 20 and contrast 30.
  await expect.poll(() => middleColour(page, blue).then((c) => near(c, [20, 40, 73]))).toBe(true);
  expect(await grey.evaluate((e) => getComputedStyle(e).opacity)).toBe('0.75');
  await grey.evaluate((e) => {
    (e as HTMLImageElement).style.opacity = '';
  });
  expect(near(await middleColour(page, grey), [116, 116, 116])).toBe(true);
  await page.screenshot({ path: test.info().outputPath('picture-colours.png') });

  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const saved = test.info().outputPath('Recoloured-saved.docx');
  await download.saveAs(saved);
  const left = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  if (!left.ok) throw new Error(left.rejection);
  const shape = (d: TextDocument) =>
    Pictures.ofDocument(d).map(({ alt, recolour, transparency, brightness, contrast }) => ({
      alt,
      recolour,
      transparency,
      brightness,
      contrast,
    }));
  expect(shape(left.document)).toEqual(shape(document));
  expectNoPageErrors(pageErrors);
});
