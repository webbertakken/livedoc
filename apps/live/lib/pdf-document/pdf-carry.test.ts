import { describe, expect, it, vi } from 'vitest';
import {
  Mark,
  PageName,
  PdfLiveChanges,
  type FileMark,
  type PageInfo,
  type UnconfirmedChange,
} from '@livedoc/pdf-documents';
import { carryPdfChanges, PDF_CARRY_ORIGIN } from './pdf-carry';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "A change carried across a replacement": each change by
// its anchor, read from the new file.

const page = (objectNumber: number): PageInfo => ({
  name: PageName.ofObject(objectNumber),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
});
const PAGES = [page(3), page(7), page(9)];
const highlight = (id: string, on: PageName) =>
  Mark.highlight({
    id,
    page: on,
    quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
    text: 'The quick',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;
const made = (id: string, on: PageName): UnconfirmedChange => ({
  root: 'marks',
  id,
  held: null,
  made: highlight(id, on),
});
const fileMark = (id: string) => ({ id }) as FileMark;
const ids = (doc: ReturnType<typeof PdfLiveChanges.load>) =>
  PdfLiveChanges.marks(doc).map((mark) => mark.id);

describe('carryPdfChanges', () => {
  it('asks the file for nothing where there is nothing to carry', async () => {
    const fileMarks = vi.fn(async () => []);
    expect(await carryPdfChanges(PdfLiveChanges.load(), [], { pages: PAGES, fileMarks })).toBe(0);
    expect(fileMarks).not.toHaveBeenCalled();
  });

  it('makes each mark again on its page, under the origin of a carried change', async () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction) => origins.push(transaction.origin));
    const lost = await carryPdfChanges(
      doc,
      [made('a', PAGES[0]!.name), made('b', PAGES[2]!.name)],
      { pages: PAGES, fileMarks: async () => [] },
    );
    expect(lost).toBe(0);
    expect(ids(doc)).toEqual(['a', 'b']);
    expect(origins).toEqual([PDF_CARRY_ORIGIN]);
  });

  it('reads the file’s own marks only on the pages the marks name, and passes over one it holds', async () => {
    const doc = PdfLiveChanges.load();
    const fileMarks = vi.fn(async (index: number) => (index === 2 ? [fileMark('b')] : []));
    const changes: UnconfirmedChange[] = [
      made('a', PAGES[0]!.name),
      made('b', PAGES[2]!.name),
      { root: 'marks', id: 'c', held: highlight('c', PAGES[2]!.name), made: null },
      { root: 'pages', id: PAGES[1]!.name, held: null, made: { rotation: 90 } },
    ];
    expect(await carryPdfChanges(doc, changes, { pages: PAGES, fileMarks })).toBe(0);
    expect(fileMarks.mock.calls.map(([index]) => index)).toEqual([0, 2]);
    expect(ids(doc)).toEqual(['a']);
    expect([...PdfLiveChanges.pageTurns(doc)]).toEqual([[PAGES[1]!.name, 90]]);
  });

  it('counts what has nothing left to stand on', async () => {
    const doc = PdfLiveChanges.load();
    const lost = await carryPdfChanges(
      doc,
      [made('a', PAGES[0]!.name), made('gone', PageName.ofObject(41))],
      { pages: PAGES, fileMarks: async () => [] },
    );
    expect(lost).toBe(1);
    expect(ids(doc)).toEqual(['a']);
  });

  it('makes none, and counts them all lost, where the file’s own marks cannot be read', async () => {
    const doc = PdfLiveChanges.load();
    const lost = await carryPdfChanges(
      doc,
      [made('a', PAGES[0]!.name), made('b', PAGES[0]!.name)],
      {
        pages: PAGES,
        fileMarks: async () => {
          throw new Error('the engine stopped');
        },
      },
    );
    expect(lost).toBe(2);
    expect(ids(doc)).toEqual([]);
  });
});
