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
  const first = page.locator('[data-page-notes-of="1"] [data-page-notes]');
  await expect(first.locator('[data-note-number]')).toHaveText([
    '1The first source.',
    '2The second source.',
  ]);
  await expect(first.locator('[data-notes-rule]')).toBeVisible();
  const last = page.locator('[data-page-notes-of]').last().locator('[data-page-notes]');
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

// Inserting and editing footnotes (page-layout.md "Footnotes", "Insert > Footnote", "Editing a note"): Ctrl+Alt+F puts
// a mark at the caret and the caret in its new note at the page's foot; typing writes the note; Escape goes back just
// after the mark; a press on the note enters it again; Move to current footnote goes back and forth; one undo in the
// body takes the mark away.
test('a footnote is put in, written, left, entered again and undone', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('A claim worth a source');
  await page.keyboard.press('Control+Alt+KeyF');

  // The mark, numbered, and the caret in its note at the foot of page 1.
  await expect(body.locator('sup[data-footnote]')).toHaveAttribute('data-number', '1');
  const edited = page.locator('[data-page-notes-of="1"] [data-note-editing] [role="textbox"]');
  await expect(edited).toBeFocused();
  await expect(edited).toHaveAttribute('aria-label', 'Footnote');
  await page.keyboard.type('The source, written in place.');
  await expect(edited).toHaveText('The source, written in place.');
  // A note made in LiveDoc is at 10 pt.
  const size = await edited
    .locator('p')
    .first()
    .evaluate((p) => getComputedStyle(p).fontSize);
  expect(Number.parseFloat(size)).toBeCloseTo((10 * 96) / 72, 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('footnote-editing.png') });

  // Escape: back in the body just after the mark, the note drawn with its number.
  await page.keyboard.press('Escape');
  await expect(body).toBeFocused();
  await page.keyboard.type('!');
  await expect(body.locator('p').first()).toHaveText('A claim worth a source!');
  const drawn = page.locator('[data-page-notes-of="1"] [data-note-number="1"]');
  await expect(drawn).toHaveText('1The source, written in place.');

  // A press on the drawn note enters it; Move to current footnote goes back to the mark.
  await drawn.click();
  await expect(edited).toBeFocused();
  // A sequence: both keys under the same modifiers, held.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyF');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(body).toBeFocused();
  await expect(drawn).toBeVisible();

  // The whole note goes with its mark, one undo step in the body, after the character typed.
  await page.keyboard.press('Control+KeyZ');
  await expect(body.locator('p').first()).toHaveText('A claim worth a source');
  await expect(body.locator('sup[data-footnote]')).toHaveCount(1);
  await page.keyboard.press('Control+KeyZ');
  await expect(body.locator('sup[data-footnote]')).toHaveCount(0);
  await expect(page.locator('[data-page-notes]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

// Footnotes on the clipboard (page-layout.md "Footnotes", "The mark"; text-and-paragraphs.md "Clipboard"): copied,
// a mark is its number in the text; pasted in the same document it brings a copy of its note; pasted in another
// document its note's writing comes with it.
test.describe('on the clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('a copied footnote pastes with a note of its own, here and in another document', async ({
    page,
    pageErrors,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const body = page.locator(BODY);
    const open = async () => {
      await page.goto('/new?kind=text-document');
      await page.waitForURL(/\/document\//);
      await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
      await body.click();
    };
    await open();
    await page.keyboard.type('A claim');
    await page.keyboard.press('Control+Alt+KeyF');
    await page.keyboard.type('The source.');
    await page.keyboard.press('Escape');
    await expect(body).toBeFocused();

    // Copied: the mark is its number in the text.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('A claim1');

    // Pasted below: a second mark, numbered 2, with a copy of the note. The editor reads a caret moved by a key from
    // the page a moment later (text-document-dom-selection.ts).
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+V');
    const marks = body.locator('sup[data-footnote]');
    await expect(marks).toHaveCount(2);
    const stories = await marks.evaluateAll((all) =>
      all.map((m) => m.getAttribute('data-footnote')),
    );
    expect(new Set(stories).size).toBe(2);
    const notes = page.locator('[data-page-notes-of="1"] [data-note-number]');
    await expect(notes).toHaveText(['1The source.', '2The source.']);

    // The copy is its own: writing in it leaves the first as it was.
    await notes.nth(1).click();
    await page.keyboard.type(' Again');
    await page.keyboard.press('Escape');
    await expect(notes).toHaveText(['1The source.', '2The source. Again']);

    // In another document, the note's writing comes with its mark.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    await open();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(body.locator('sup[data-footnote]')).toHaveCount(2);
    await expect(page.locator('[data-page-notes-of="1"] [data-note-number]')).toHaveText([
      '1The source.',
      '2The source. Again',
    ]);
    expectNoPageErrors(pageErrors);
  });
});
