// What a person holds in a PDF (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence").
import { describe, expect, it } from 'vitest';
import { Mark, PageName } from '@livedoc/pdf-documents';
import { heldOf, peerHoldsOn } from './pdf-presence-held';
import type { PdfPresencePeer } from './pdf-presence-store';

const mark = (id: string): Mark =>
  Mark.highlight({
    id,
    page: PageName.ofObject(1),
    quads: [[10, 20, 50, 20, 10, 10, 50, 10]],
    text: 'words',
    colour: '#ffeb3b',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
  })!;

const peer = (id: string, held: PdfPresencePeer['place']['held']): PdfPresencePeer => ({
  id,
  name: `Person ${id}`,
  color: '#2563eb',
  place: { page: 'p:1', mode: 'reviewing', held },
});

describe('heldOf', () => {
  it('holds the first mark selected, the one given the keys', () => {
    expect(heldOf({ page: 0, ids: ['m2', 'm1'] }, true)).toEqual({ what: 'mark', name: 'm2' });
  });

  it('holds nothing with no mark selected', () => {
    expect(heldOf(null, true)).toBeNull();
    expect(heldOf({ page: 0, ids: [] }, true)).toBeNull();
  });

  it('holds nothing while focus is outside the surface', () => {
    expect(heldOf({ page: 0, ids: ['m1'] }, false)).toBeNull();
  });
});

describe('peerHoldsOn', () => {
  it('finds each collaborator holding one of the page\u2019s marks, with the mark', () => {
    const marks = [mark('m1'), mark('m2')];
    const holds = peerHoldsOn(
      [peer('a', { what: 'mark', name: 'm2' }), peer('b', { what: 'mark', name: 'm1' })],
      marks,
    );
    expect(holds.map((hold) => [hold.id, hold.mark.id, hold.name, hold.color])).toEqual([
      ['a', 'm2', 'Person a', '#2563eb'],
      ['b', 'm1', 'Person b', '#2563eb'],
    ]);
  });

  it('places nobody for a mark the page lacks, a text selection, or nothing held', () => {
    const holds = peerHoldsOn(
      [
        peer('a', { what: 'mark', name: 'elsewhere' }),
        peer('b', { what: 'text', page: 'p:1', first: 0, last: 3 }),
        peer('c', null),
      ],
      [mark('m1')],
    );
    expect(holds).toEqual([]);
    expect(peerHoldsOn([], [mark('m1')])).toBe(peerHoldsOn([], []));
  });
});
