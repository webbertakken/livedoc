import { readFileSync, writeFileSync } from 'node:fs';
import {
  Pictures,
  readTextDocumentFile,
  TextDocument,
  writeTextDocumentFile,
  type Picture,
  type PicturePlacement,
} from '@livedoc/text-documents';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { solidPng } from './office-pictures';

// Placed pictures (docs/specs/034-text-documents/objects.md "In the editor"): a Word file's pictures placed out of
// their line are drawn at their place; the text runs beside a Wrap picture on the side with more room, below a Break
// picture, and under an In front of text or over a Behind text picture without moving; a paragraph holds its Wrap
// picture; one fixed on the page stands at its offsets from its page's corner; the file leaves as it came.

const BODY = '[role="textbox"][aria-label="Document body"]';
const GREEN = solidPng(40, 40, [52, 168, 83]);
const WORDS =
  'Words run beside the picture here, line after line, as the column has room for them. '.repeat(3);

const placed = (alt: string, size: number, placement: Partial<PicturePlacement>): Picture => ({
  type: 'picture',
  media: 'green',
  width: size,
  height: size,
  alt,
  props: {},
  placement: {
    wrap: 'wrap',
    margin: { top: 9, right: 9, bottom: 9, left: 9 },
    moves: 'with-text',
    x: 0,
    y: 0,
    ...placement,
  },
});

/** Each line's text box in the paragraph `index` of the body (client pixels), and the paragraph's own box. */
async function linesOf(page: Page, index: number) {
  return page.evaluate(
    ({ selector, index }) => {
      const p = document.querySelectorAll(`${selector} > p`)[index]!;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const rects: { left: number; right: number; top: number; bottom: number }[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        range.selectNodeContents(node);
        for (const r of range.getClientRects())
          if (r.width > 0)
            rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      const box = p.getBoundingClientRect();
      return { rects, box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right } };
    },
    { selector: BODY, index },
  );
}

test('placed pictures are drawn at their place, the text kept clear as each wrap says', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const blank = TextDocument.blank({ format: 'ooxml', title: 'Placed' });
  const paragraph = blank.body[0] as Extract<TextDocument['body'][number], { type: 'paragraph' }>;
  const para = (
    inlines: Extract<TextDocument['body'][number], { type: 'paragraph' }>['inlines'],
  ) => ({
    ...paragraph,
    inlines,
  });
  const run = (text: string) => ({ type: 'run' as const, text, props: {} });
  const made: TextDocument = {
    ...blank,
    body: [
      para([placed('Wrapped', 90, { x: 0, y: 0 }), run(`Short.`)]),
      para([run('After the wrapped picture.')]),
      para([placed('Wrapped right', 90, { x: 360, y: 0 }), run(WORDS)]),
      para([placed('Broken', 60, { wrap: 'break', x: 100, y: 0 }), run(WORDS)]),
      para([placed('In front', 60, { wrap: 'front', x: 40, y: 0 }), run(WORDS)]),
      para([placed('Behind', 60, { wrap: 'behind', x: 200, y: 0 }), run(WORDS)]),
      para([
        run('Fixed on the page.'),
        placed('Fixed', 30, { wrap: 'front', moves: 'page', x: 72, y: 36 }),
      ]),
    ],
    media: { green: { mediaType: 'image/png', bytes: new Uint8Array(GREEN) } },
  };
  const written = writeTextDocumentFile(made, 'docx');
  const file = test.info().outputPath('Placed.docx');
  writeFileSync(file, written.bytes);

  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Placed');
  const body = page.locator(BODY);
  const img = (name: string) => body.getByRole('img', { name, exact: true });
  for (const name of ['Wrapped', 'Wrapped right', 'Broken', 'In front', 'Behind', 'Fixed'])
    await expect(img(name)).toBeVisible();
  await expect(body.locator('.text-document-picture-placed')).toHaveCount(6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('placed-pictures.png'), fullPage: true });

  // Client pixels per point, from the first sheet's width (an 8.5 in Letter or A4 page, as the blank sets it up).
  const sheet = page.locator('[data-page-sheet="1"]');
  const sheetBox = (await sheet.boundingBox())!;
  const scale = await sheet.evaluate(
    (e) => e.getBoundingClientRect().width / (e as HTMLElement).offsetWidth,
  );
  const pt = (96 / 72) * scale;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(2);

  // Wrap, on the left: the short text beside it, and the paragraph holding it, the next one below its foot.
  const wrapped = (await img('Wrapped').boundingBox())!;
  const first = await linesOf(page, 0);
  expect(first.rects[0]!.left).toBeGreaterThanOrEqual(wrapped.x + wrapped.width + 9 * pt - 1);
  const second = await linesOf(page, 1);
  expect(second.box.top).toBeGreaterThanOrEqual(wrapped.y + wrapped.height + 9 * pt - 1);

  // Wrap, in the column's right half: the text runs on its left.
  const right = (await img('Wrapped right').boundingBox())!;
  const beside = await linesOf(page, 2);
  const besideIt = beside.rects.filter((r) => r.top < right.y + right.height);
  expect(besideIt.length).toBeGreaterThan(0);
  for (const r of besideIt) expect(r.right).toBeLessThanOrEqual(right.x - 9 * pt + 1);

  // Break: no text beside it; the text starts below its foot and margin.
  const broken = (await img('Broken').boundingBox())!;
  const below = await linesOf(page, 3);
  expect(below.rects[0]!.top).toBeGreaterThanOrEqual(broken.y + broken.height + 9 * pt - 1);

  // In front of text and Behind text: the text starts at its paragraph's top, under or over the picture.
  for (const [index, name, front] of [
    [4, 'In front', true],
    [5, 'Behind', false],
  ] as const) {
    const lines = await linesOf(page, index);
    const box = (await img(name).boundingBox())!;
    expect(lines.rects[0]!.top - lines.box.top).toBeLessThan(4);
    expect(box.y).toBeLessThan(lines.rects[0]!.bottom);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? '', {
      x: box.x + box.width / 2,
      y: lines.rects[0]!.top + 4,
    });
    if (front) expect(hit).toBe('IMG');
    else expect(hit).not.toBe('IMG');
  }

  // Fixed on the page: at its offsets from its page's top left corner, wherever its paragraph stands.
  const fixed = (await img('Fixed').boundingBox())!;
  near(fixed.x - sheetBox.x, 72 * pt);
  near(fixed.y - sheetBox.y, 36 * pt);

  // Downloaded, the same placements.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const saved = test.info().outputPath('Placed-saved.docx');
  await download.saveAs(saved);
  const left = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(left.ok).toBe(true);
  if (left.ok)
    expect(Pictures.ofDocument(left.document).map((p) => [p.alt, p.placement])).toEqual(
      Pictures.ofDocument(made).map((p) => [p.alt, p.placement]),
    );
  expectNoPageErrors(pageErrors);
});
