import { readFileSync } from 'node:fs';
import { readTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert > Horizontal line (docs/specs/034-text-documents/objects.md "Horizontal line"): at the caret the paragraph is
// split around an empty paragraph whose bottom border runs across the text width; the caret writes on after it; one
// undo takes it away; Backspace after it takes it away; the file holds it as a paragraph border.

const BODY = '[role="textbox"][aria-label="Document body"]';

test('a horizontal line goes in at the caret, and leaves as a paragraph border', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Above below');
  for (let i = 0; i < 'below'.length; i++) await page.keyboard.press('ArrowLeft');

  await (await officeMenuItem(page, ['Insert', 'Horizontal line'])).click();
  const paragraphs = body.locator(':scope > p');
  await expect(paragraphs).toHaveCount(3);
  await expect(paragraphs.nth(0)).toHaveText('Above ');
  await expect(paragraphs.nth(2)).toHaveText('below');
  const line = paragraphs.nth(1);
  await expect(line).toHaveText('');
  // Across the text width: as wide as the paragraphs either side of it, its line at its foot.
  const [lineBox, textBox] = [await line.boundingBox(), await paragraphs.nth(0).boundingBox()];
  expect(Math.abs(lineBox!.width - textBox!.width)).toBeLessThanOrEqual(1);
  await expect(line).toHaveCSS('border-bottom-style', 'solid');
  // 1 pt, drawn in whole device pixels; every element is solid of no width until a border is drawn.
  expect(
    Number.parseFloat(await line.evaluate((e) => getComputedStyle(e).borderBottomWidth)),
  ).toBeGreaterThanOrEqual(1);
  await expect(line).toHaveCSS('border-bottom-color', 'rgb(166, 166, 166)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('horizontal-line.png') });

  // The caret writes on at the start of the paragraph after it (its first letter a capital, as typing aids make it).
  await page.keyboard.type('and ');
  await expect(paragraphs.nth(2)).toHaveText('And below');

  // Leaves as a paragraph border (the new document is ODF).
  const download = await officeMenuItem(page, ['File', 'Download', 'OpenDocument format (.odt)']);
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const saved = test.info().outputPath('line.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const blocks = read.document.body.filter((b) => b.type === 'paragraph');
    expect(blocks[1]).toMatchObject({
      inlines: [],
      props: { borders: { bottom: { width: 1, dash: 'solid', color: '#a6a6a6' } } },
    });
  }

  // Backspace at the start of the paragraph after it takes the line away, that paragraph's text kept.
  await body.focus();
  for (let i = 0; i < 'and '.length; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(paragraphs).toHaveCount(2);
  await expect(paragraphs.nth(1)).toHaveText('And below');
  await expect(paragraphs.nth(1)).toHaveCSS('border-bottom-width', '0px');
  expectNoPageErrors(pageErrors);
});
