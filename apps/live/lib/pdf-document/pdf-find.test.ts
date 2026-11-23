// docs/specs/035-pdf-documents/reading-surface.md "Find": a search page by page, told as each page is searched; the
// marks' words and the bookmarks where asked, bookmarks first; at most the listed results, every one counted; each
// result with its line either side of the match; a search stopped by a newer one tells nothing more.
import { describe, expect, it, vi } from 'vitest';
import { PageText, type FileMark, type Outline } from '@livedoc/pdf-documents';
import { searchPdf, snippetOf, type PdfFindProgress } from './pdf-find';

const textOf = (text: string) =>
  PageText.of(
    [...text].map((c) => c.codePointAt(0)!),
    [...text].flatMap((_, at) => [at * 6, 700, at * 6 + 6, 708]),
  );

const OUTLINE: Outline = {
  items: [{ title: 'About the fox', depth: 0, target: null }],
  cut: false,
};
const MARK = {
  id: 'n1',
  words: 'A fox note',
  rect: [10, 20, 30, 40],
} as unknown as FileMark;

function source(pages = ['The fox', 'No match', 'fox and fox']) {
  return {
    pages: pages.length,
    pageText: vi.fn(async (index: number) =>
      pages[index] === undefined ? null : textOf(pages[index]),
    ),
    fileMarks: vi.fn(async (index: number) => (index === 1 ? [MARK] : [])),
    outline: vi.fn(async () => OUTLINE),
  };
}

const OFF = { matchCase: false, wholeWords: false, marks: false, bookmarks: false };

async function search(options = OFF, from = source(), most?: number) {
  const told: PdfFindProgress[] = [];
  await searchPdf(from, 'fox', options, {
    onProgress: (now) => told.push(now),
    stopped: () => false,
    most,
  });
  return { told, last: told.at(-1)!, from };
}

describe('searching a PDF', () => {
  it('searches page by page, telling each page as it goes', async () => {
    const { told, last, from } = await search();
    expect(told.map((now) => now.searched)).toEqual([1, 2, 3]);
    expect(
      last.results.map((result) => [result.kind, 'page' in result ? result.page : -1]),
    ).toEqual([
      ['text', 0],
      ['text', 2],
      ['text', 2],
    ]);
    expect(last.total).toBe(3);
    expect(from.fileMarks).not.toHaveBeenCalled();
    expect(from.outline).not.toHaveBeenCalled();
    // A result lies over its glyphs: "fox" on page one is the fifth to seventh characters, 6 points each.
    expect(last.results[0]).toMatchObject({
      span: [4, 7],
      quads: [[24, 708, 42, 708, 24, 700, 42, 700]],
      snippet: { before: 'The ', match: 'fox', after: '' },
    });
  });

  it('finds the bookmarks first and the marks’ words where asked', async () => {
    const { last } = await search({ ...OFF, marks: true, bookmarks: true });
    expect(last.results.map((result) => result.kind)).toEqual([
      'bookmark',
      'text',
      'mark',
      'text',
      'text',
    ]);
    expect(last.results[0]).toMatchObject({
      item: 0,
      snippet: { before: 'About the ', match: 'fox' },
    });
    expect(last.results[2]).toMatchObject({
      page: 1,
      mark: 'n1',
      quads: [[10, 40, 30, 40, 10, 20, 30, 20]],
      snippet: { before: 'A ', match: 'fox', after: ' note' },
    });
  });

  it('lists at most the most it lists, and counts every one', async () => {
    const { last } = await search(OFF, source(), 2);
    expect(last.results).toHaveLength(2);
    expect(last.total).toBe(3);
  });

  it('passes a page with no text, and stops telling once a newer search began', async () => {
    const from = source(['fox']);
    from.pages = 2;
    const told: PdfFindProgress[] = [];
    let stop = false;
    await searchPdf(from, 'fox', OFF, {
      onProgress: (now) => {
        told.push(now);
        stop = true;
      },
      stopped: () => stop,
    });
    expect(told).toHaveLength(1);
    const whole = await search(OFF, from);
    expect(whole.last).toMatchObject({ searched: 2, total: 1 });
  });

  it('tells nothing of a page read while a newer search began', async () => {
    const from = source();
    const told: PdfFindProgress[] = [];
    await searchPdf(from, 'fox', OFF, {
      onProgress: (now) => told.push(now),
      stopped: () => from.pageText.mock.calls.length > 0,
    });
    expect(told).toEqual([]);
  });

  it('finds nothing for an empty query, telling at once that it is done', async () => {
    const told: PdfFindProgress[] = [];
    const from = source();
    await searchPdf(from, '  ', OFF, { onProgress: (now) => told.push(now), stopped: () => false });
    expect(told).toEqual([{ results: [], total: 0, searched: 3 }]);
    expect(from.pageText).not.toHaveBeenCalled();
  });
});

describe('a result’s line of text', () => {
  it('shows the match with its line either side, kept short, breaks read as spaces', () => {
    const text = 'Before\r\nsome words around the com\u0002pile match and more after it\r\nNext';
    const start = text.indexOf('com');
    expect(snippetOf(text, [start, start + 8], 10)).toEqual({
      before: 'round the ',
      match: 'compile',
      after: ' match and',
    });
  });
});
