// docs/specs/035-pdf-documents/marks.md "Making a mark", "Limits"; live-editing-and-storage.md "The layout".
import { describe, expect, it } from 'vitest';
import { applyUpdate } from 'yjs';
import type { BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import { addHighlight, HIGHLIGHT_COLOUR } from './pdf-highlight';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';
import { marksOnPage, pdfMarksStore } from './pdf-marks-store';

const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];
const selection: TextSelection = { text: 'The quick brown fox', quads: [QUAD] };
const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };
const page = PageName.ofObject(4);
const by = (id: string) => ({ author: 'Ada', now: 1_795_000_000_000, id });

describe('addHighlight', () => {
  it('adds one mark over the text, in the soft yellow, as one change that names the stored file', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const made = addHighlight(doc, { page, stored }, selection, by('m1'));
    expect(made.ok && made.mark).toMatchObject({
      id: 'm1',
      kind: 'highlight',
      page,
      text: 'The quick brown fox',
      colour: HIGHLIGHT_COLOUR,
      opacity: 1,
      author: 'Ada',
    });
    expect(HIGHLIGHT_COLOUR).toMatch(/^#[0-9a-f]{6}$/);
    expect(PdfLiveChanges.stored(doc)).toEqual(stored);
    expect(PdfLiveChanges.marks(doc)).toHaveLength(1);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  // "A highlight drag that covers no text": no mark, and nothing changed.
  it('makes no mark where the drag covered no text', () => {
    const doc = PdfLiveChanges.load();
    expect(addHighlight(doc, { page, stored }, null, by('m1'))).toEqual({
      ok: false,
      reason: 'no_text',
    });
    expect(addHighlight(doc, { page, stored }, { text: '', quads: [] }, by('m1')).ok).toBe(false);
    expect(addHighlight(doc, { page, stored }, selection, by('not an id')).ok).toBe(false);
    expect(PdfLiveChanges.isEmpty(doc)).toBe(true);
    expect(PdfLiveChanges.stored(doc)).toBeNull();
  });

  it('refuses a mark past the most one PDF document holds', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    expect(addHighlight(doc, { page, stored }, selection, by('one-more'))).toEqual({
      ok: false,
      reason: 'pdf_too_many_marks',
    });
  });
});

// marks.md "Together": a mark appears for everyone as it is made.
describe('the marks store', () => {
  it('reads marks by page, and renews only when a mark changes', () => {
    const doc = PdfLiveChanges.load();
    const other = PdfLiveChanges.load();
    addHighlight(doc, { page, stored }, selection, by('m1'));
    const store = pdfMarksStore(doc);
    const first = store.get();
    expect(marksOnPage(first, page).map((mark) => mark.id)).toEqual(['m1']);
    expect(marksOnPage(first, PageName.ofObject(9))).toEqual([]);

    let renewed = 0;
    const stop = store.subscribe(() => (renewed += 1));
    const alsoListening = store.subscribe(() => {});
    // Someone else's mark arrives from the room.
    addHighlight(other, { page: PageName.ofObject(9), stored }, selection, by('m2'));
    PdfLiveChanges.setStored(doc, stored);
    expect(store.get()).toBe(first);
    applyUpdate(doc, PdfLiveChanges.encode(other));
    expect(renewed).toBe(1);
    expect(marksOnPage(store.get(), PageName.ofObject(9)).map((mark) => mark.id)).toEqual(['m2']);
    expect(marksOnPage(store.get(), page).map((mark) => mark.id)).toEqual(['m1']);

    stop();
    alsoListening();
    addHighlight(doc, { page, stored }, selection, by('m3'));
    expect(renewed).toBe(1);
  });
});
