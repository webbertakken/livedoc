import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Words in every script end to end (docs/specs/035-pdf-documents/marks.md "Words in every script": a mark Helvetica
// cannot write is drawn and written in the mark faces; "Loading": the faces load only when a mark needs them, from
// LiveDoc's own origin; "In the file": each face embedded as a subset, never a question mark).

/** A press on page one at a point given as fractions of its box, kept within the window. */
async function pressAt(page: Page, first: Locator, [x, y]: [number, number]) {
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('a Text in Greek, Cyrillic and Devanagari is drawn and downloaded in Noto Sans', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  const faces: string[] = [];
  page.context().on('request', (request) => {
    if (/\.woff$/.test(new URL(request.url()).pathname)) faces.push(request.url());
  });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(1);
  await dropPdf(page, 'Scripts.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  // Nothing of the mark faces loads for a file whose marks Helvetica writes.
  expect(faces).toEqual([]);

  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('x');
  await pressAt(page, first, [0.12, 0.14]);
  const typing = page.locator(`${PAGE_ONE} textarea[data-pdf-typing]`);
  await expect(typing).toBeFocused();
  await page.keyboard.type('Ελληνικά Кириллица');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Łódź नमस्ते');
  await page.keyboard.press('Escape');
  const words = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="text"] text`);
  await expect(words).toHaveText(['Ελληνικά Кириллица', 'Łódź नमस्ते']);
  await expect(words.first().locator('..')).toHaveAttribute('font-family', /LiveDoc Noto Sans/);
  // The surface's faces arrive from LiveDoc's own origin.
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "LiveDoc Noto Sans"', 'Ελλη')))
    .toBe(true);
  expect(faces.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pdf-scripts.png') });

  // Downloaded: the words in Noto Sans subsets, glyph ids, never Helvetica's question mark.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = test.info().outputPath('Scripts.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const entry of ['/CIDFontType2', '/Identity-H', '/ToUnicode', '+NotoSans-Regular'])
    expect(added).toContain(entry);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
