// Picture files for the office end-to-end suites: real PNGs built in plain code, so a test hands the editor a picture.
// And a new text document holding one, for the suites that work with a picture.
import { deflateSync } from 'node:zlib';
import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';
import { officeMenuItem } from './office-menus';

const BODY = '[role="textbox"][aria-label="Document body"]';

/** A solid PNG `width` by `height` (zlib through node), so a test hands the editor a real picture file. */
export function solidPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Buffer {
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

// A new text document holding one picture of 240 × 120 pixels, inserted from the computer and left selected, and its
// size as drawn, in CSS pixels.
export async function documentWithPicture(page: Page, words: string) {
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
