import { describe, expect, it } from 'vitest';
import { Mark, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import { ROOM_ORIGIN } from '@/lib/live-tab/live-tab-room-binding';
import { unconfirmedPdfChanges } from './pdf-unconfirmed-changes';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Limits": the room's refusal of a frame is undone here, so
// what the surface shows is what everyone holds.

const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];
const highlight = (id: string) =>
  Mark.highlight({
    id,
    page: 'p:1',
    quads: [QUAD],
    text: 'words',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;
const ids = (doc: ReturnType<typeof PdfLiveChanges.load>) =>
  PdfLiveChanges.marks(doc).map((mark) => mark.id);

describe('unconfirmedPdfChanges', () => {
  it('takes back the newest change made here that the room has not confirmed, one a refusal', () => {
    const doc = PdfLiveChanges.load();
    const changes = unconfirmedPdfChanges(doc);
    PdfLiveChanges.addMark(doc, highlight('a'));
    PdfLiveChanges.addMark(doc, highlight('b'));
    expect(changes.undoNewest()).toBe(true);
    expect(ids(doc)).toEqual(['a']);
    expect(changes.undoNewest()).toBe(true);
    expect(ids(doc)).toEqual([]);
    expect(changes.undoNewest()).toBe(false);
  });

  it('never takes back a change the room holds', () => {
    const doc = PdfLiveChanges.load();
    const changes = unconfirmedPdfChanges(doc);
    PdfLiveChanges.addMark(doc, highlight('a'));
    changes.confirmed();
    PdfLiveChanges.addMark(doc, highlight('b'));
    expect(changes.undoNewest()).toBe(true);
    expect(changes.undoNewest()).toBe(false);
    expect(ids(doc)).toEqual(['a']);
  });

  it("never takes back another person's change, nor counts its own undoing as a change", () => {
    const doc = PdfLiveChanges.load();
    const changes = unconfirmedPdfChanges(doc);
    PdfLiveChanges.addMark(doc, highlight('theirs'), ROOM_ORIGIN);
    expect(changes.undoNewest()).toBe(false);
    PdfLiveChanges.addMark(doc, highlight('mine'));
    expect(changes.undoNewest()).toBe(true);
    expect(changes.undoNewest()).toBe(false);
    expect(ids(doc)).toEqual(['theirs']);
  });

  it('stops watching once closed', () => {
    const doc = PdfLiveChanges.load();
    const changes = unconfirmedPdfChanges(doc);
    changes.close();
    PdfLiveChanges.addMark(doc, highlight('a'));
    expect(changes.undoNewest()).toBe(false);
    expect(ids(doc)).toEqual(['a']);
  });
});
