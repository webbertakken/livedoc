import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { pdfDigest } from './digest';
import { PDF_MAX_MARKS } from './limits';
import { PdfLiveChanges } from './live-changes';
import { Mark, type Quad } from './mark';

const BLOB = 'a'.repeat(64) as BlobKey;
const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const highlight = (id: string, text = 'words') =>
  Mark.highlight({
    id,
    page: 'p:4',
    quads: [QUAD],
    text,
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;

/** A person's changes as the updates their document sends. */
function person(): { doc: Y.Doc; sent: Uint8Array[] } {
  const doc = PdfLiveChanges.load();
  const sent: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => sent.push(update));
  return { doc, sent };
}

describe('PdfLiveChanges', () => {
  it('holds nothing for a PDF nobody changed', () => {
    const doc = PdfLiveChanges.load([PdfLiveChanges.merge([])]);
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
    expect(PdfLiveChanges.stored(doc)).toBeNull();
  });

  it('names its stored file, which alone is no change', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.setStored(doc, { blob: BLOB, pages: 14 });
    expect(PdfLiveChanges.stored(doc)).toEqual({ blob: BLOB, pages: 14 });
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
  });

  it('reads no stored file from a key or a page count that is not one', () => {
    const doc = PdfLiveChanges.load();
    doc.getMap('stored').set('blob', 'not a key');
    doc.getMap('stored').set('pages', 3);
    expect(PdfLiveChanges.stored(doc)).toBeNull();
    doc.getMap('stored').set('blob', BLOB);
    doc.getMap('stored').set('pages', 1.5);
    expect(PdfLiveChanges.stored(doc)).toBeNull();
    doc.getMap('stored').set('pages', -1);
    expect(PdfLiveChanges.stored(doc)).toBeNull();
  });

  it('keeps both marks when two people each add one at once', () => {
    const ada = person();
    const ben = person();
    expect(PdfLiveChanges.addMark(ada.doc, highlight('a'))).toBeNull();
    expect(PdfLiveChanges.addMark(ben.doc, highlight('b'))).toBeNull();
    // Each receives the other's updates, in either order.
    for (const update of ben.sent) Y.applyUpdate(ada.doc, update);
    for (const update of ada.sent) Y.applyUpdate(ben.doc, update);
    expect(PdfLiveChanges.marks(ada.doc).map((m) => m.id)).toEqual(['a', 'b']);
    expect(PdfLiveChanges.marks(ben.doc)).toEqual(PdfLiveChanges.marks(ada.doc));
    expect(PdfLiveChanges.isEmpty(ada.doc)).toBe(false);
  });

  it('merges updates in any order to the same marks, without a live document', () => {
    const ada = person();
    PdfLiveChanges.addMark(ada.doc, highlight('a'));
    PdfLiveChanges.addMark(ada.doc, highlight('b'));
    const forward = PdfLiveChanges.merge(ada.sent);
    const backward = PdfLiveChanges.merge([...ada.sent].reverse());
    expect(PdfLiveChanges.marks(PdfLiveChanges.load([forward]))).toEqual(
      PdfLiveChanges.marks(PdfLiveChanges.load([backward])),
    );
    expect(PdfLiveChanges.marks(PdfLiveChanges.load([forward]))).toHaveLength(2);
  });

  it('removes a mark, and changes nothing for one that is not there', () => {
    const ada = person();
    PdfLiveChanges.addMark(ada.doc, highlight('a'));
    const sent = ada.sent.length;
    PdfLiveChanges.removeMark(ada.doc, 'missing');
    expect(ada.sent).toHaveLength(sent);
    PdfLiveChanges.removeMark(ada.doc, 'a');
    expect(PdfLiveChanges.marks(ada.doc)).toEqual([]);
    expect(PdfLiveChanges.isEmpty(ada.doc)).toBe(true);
  });

  it('leaves out an entry that is no mark', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(doc, highlight('a'));
    const hostile = new Y.Map<unknown>();
    hostile.set('id', 'x');
    hostile.set('kind', 'highlight');
    doc.getMap('marks').set('x', hostile);
    doc.getMap('marks').set('y', 'a string');
    expect(PdfLiveChanges.marks(doc).map((m) => m.id)).toEqual(['a']);
  });

  it('refuses a mark past the limit whole, and still takes a change to one it holds', () => {
    const doc = PdfLiveChanges.load();
    const marks = doc.getMap('marks');
    doc.transact(() => {
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, new Y.Map());
    });
    expect(PdfLiveChanges.addMark(doc, highlight('one-more'))).toBe('pdf_too_many_marks');
    expect(marks.has('one-more')).toBe(false);
    expect(PdfLiveChanges.addMark(doc, highlight('m0'))).toBeNull();
  });

  it('tells a Yjs update and a state vector from other bytes', () => {
    const ada = person();
    PdfLiveChanges.addMark(ada.doc, highlight('a'));
    const state = PdfLiveChanges.encode(ada.doc);
    expect(PdfLiveChanges.decodes(state)).toBe(true);
    expect(PdfLiveChanges.decodes(new Uint8Array([9, 9, 9, 9]))).toBe(false);
    expect(PdfLiveChanges.isStateVector(PdfLiveChanges.stateVectorOf(state))).toBe(true);
    expect(PdfLiveChanges.isStateVector(new Uint8Array([255, 255, 255]))).toBe(false);
  });

  it('answers a catch-up with only what the reader lacks', () => {
    const ada = person();
    PdfLiveChanges.addMark(ada.doc, highlight('a'));
    const before = PdfLiveChanges.encode(ada.doc);
    PdfLiveChanges.addMark(ada.doc, highlight('b'));
    const after = PdfLiveChanges.encode(ada.doc);
    const missing = PdfLiveChanges.since(after, PdfLiveChanges.stateVectorOf(before));
    const reader = PdfLiveChanges.load([before, missing]);
    expect(PdfLiveChanges.marks(reader).map((m) => m.id)).toEqual(['a', 'b']);
    expect(missing.byteLength).toBeLessThan(after.byteLength);
  });
});

describe('pdfDigest', () => {
  it('is never empty, counts the stored pages and gives the words under the marks to search', () => {
    const doc = PdfLiveChanges.load();
    expect(pdfDigest(doc)).toEqual({
      characters: 0,
      words: 0,
      pages: 0,
      hasContent: true,
      searchText: '',
      marks: 0,
    });
    PdfLiveChanges.setStored(doc, { blob: BLOB, pages: 14 });
    PdfLiveChanges.addMark(doc, highlight('a', 'trace trees'));
    PdfLiveChanges.addMark(doc, highlight('b', ''));
    PdfLiveChanges.addMark(doc, highlight('c', 'type maps'));
    expect(pdfDigest(doc)).toMatchObject({
      pages: 14,
      searchText: 'trace trees\ntype maps',
      marks: 3,
    });
  });
});

// The api Worker loads this module: nothing may draw random numbers while it loads (a live document does).
describe('loading the module', () => {
  it('draws no random numbers, and knows the empty state as Yjs writes it', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    vi.resetModules();
    const fresh = await import('./live-changes');
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(fresh.PdfLiveChanges.merge([])).toEqual(Y.encodeStateAsUpdate(new Y.Doc()));
  });
});
