import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Paragraph, TextDocument, writeTextDocumentFile, type Note } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Footnotes drawn (docs/specs/034-text-documents/page-layout.md "Footnotes"): an OpenDocument file's notes open with
// their marks numbered 1, 2, 3 in order, each note at the foot of the page its mark is on under a short rule, led by
// its number; with print layout off, every note under the writing in order.

const BODY = '[role="textbox"][aria-label="Document body"]';
const FILLER =
  'A footnote stands at the foot of the page its mark is on, and the writing above it makes room for it.';

function fileWithNotes(): string {
  const blank = TextDocument.blank({ format: 'odf', title: 'Notes' });
  const normal = (blank.body[0] as Paragraph).style;
  const note = (text: string): Note => ({
    type: 'note',
    blocks: [Paragraph.of(text, normal)],
    props: {},
  });
  const body: Paragraph[] = [
    {
      ...Paragraph.of('', normal),
      inlines: [
        { type: 'run', text: 'A claim', props: {} },
        note('The first source.'),
        { type: 'run', text: ' and another', props: {} },
        note('The second source.'),
        { type: 'run', text: '.', props: {} },
      ],
    },
    ...Array.from({ length: 40 }, (_, i) => Paragraph.of(`Paragraph ${i + 1}. ${FILLER}`, normal)),
    {
      ...Paragraph.of('', normal),
      inlines: [{ type: 'run', text: 'The last word', props: {} }, note('The third source.')],
    },
  ];
  const written = writeTextDocumentFile({ ...blank, body }, 'fodt');
  if (!written.ok) throw new Error(written.rejection);
  const path = join(mkdtempSync(join(tmpdir(), 'livedoc-notes-')), 'Notes.fodt');
  writeFileSync(path, written.bytes);
  return path;
}

test('footnotes open numbered, at the foot of their pages, and under the writing without pages', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(fileWithNotes());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notes');
  const body = page.locator(BODY);

  // The marks numbered in order, read as "Footnote N".
  const marks = body.locator('sup[data-footnote]');
  await expect(marks).toHaveCount(3);
  await expect(marks.nth(0)).toHaveAttribute('data-number', '1');
  await expect(marks.nth(2)).toHaveAttribute('aria-label', 'Footnote 3');

  // Page 1 draws the first two notes at its foot under a rule; the last page the third.
  const first = page.locator('[data-page-sheet="1"] [data-page-notes]');
  await expect(first.locator('[data-note-number]')).toHaveText([
    '1The first source.',
    '2The second source.',
  ]);
  await expect(first.locator('[data-notes-rule]')).toBeVisible();
  const last = page.locator('[data-page-sheet]').last().locator('[data-page-notes]');
  await expect(last.locator('[data-note-number]')).toHaveText(['3The third source.']);

  // The writing on page 1 stops above its notes.
  const sheet = page.locator('[data-page-sheet="1"]');
  const sheetBox = (await sheet.boundingBox())!;
  const notesTop = (await first.boundingBox())!.y;
  const lowest = await body.evaluate((el, foot) => {
    let max = 0;
    for (const p of el.querySelectorAll(':scope > :not(.text-document-page-gap)')) {
      const r = p.getBoundingClientRect();
      if (r.bottom <= foot && r.height > 0) max = Math.max(max, r.bottom);
    }
    return max;
  }, sheetBox.y + sheetBox.height);
  expect(lowest).toBeLessThanOrEqual(notesTop + 1);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('footnotes-page-foot.png') });

  // Print layout off: every note under the writing, in order.
  const printLayout = await officeMenuItem(page, ['View', 'Show print layout']);
  await printLayout.click();
  const endNotes = page.getByRole('region', { name: 'Footnotes' });
  await expect(endNotes.locator('li')).toHaveText([
    '1The first source.',
    '2The second source.',
    '3The third source.',
  ]);
  await endNotes.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('footnotes-pageless.png') });
  expectNoPageErrors(pageErrors);
});
