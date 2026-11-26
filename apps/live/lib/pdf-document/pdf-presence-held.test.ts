// What a person holds in a PDF (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence").
import { describe, expect, it } from 'vitest';
import { Mark, PageName } from '@livedoc/pdf-documents';
import { heldOf, peerHoldsOn, peerTextsOn } from './pdf-presence-held';
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

const text = {
  page: 'p:2',
  spans: [
    [4, 9],
    [12, 20],
  ] as const,
};

describe('heldOf', () => {
  const held = (over: Partial<Parameters<typeof heldOf>[0]>) =>
    heldOf({ chosen: null, text: null, focused: true, reviews: true, ...over });

  it('holds the first mark selected, the one given the keys', () => {
    expect(held({ chosen: { page: 0, ids: ['m2', 'm1'] } })).toEqual({ what: 'mark', name: 'm2' });
  });

  it('holds the text selected, from its first character to its last', () => {
    expect(held({ text })).toEqual({ what: 'text', page: 'p:2', first: 4, last: 19 });
  });

  it('holds a mark before text', () => {
    expect(held({ chosen: { page: 0, ids: ['m1'] }, text })).toMatchObject({ what: 'mark' });
  });

  it('holds nothing with nothing selected', () => {
    expect(held({})).toBeNull();
    expect(held({ chosen: { page: 0, ids: [] } })).toBeNull();
    expect(held({ text: { page: 'p:2', spans: [] } })).toBeNull();
  });

  it('holds nothing while focus is outside the surface', () => {
    expect(held({ chosen: { page: 0, ids: ['m1'] }, text, focused: false })).toBeNull();
  });

  it('holds nothing for a Viewer, whose text selection is their own', () => {
    expect(held({ text, reviews: false })).toBeNull();
  });
});

describe('peerTextsOn', () => {
  it('finds each collaborator whose text selection is on the page', () => {
    const texts = peerTextsOn(
      [
        peer('a', { what: 'text', page: 'p:1', first: 2, last: 7 }),
        peer('b', { what: 'text', page: 'p:9', first: 0, last: 3 }),
        peer('c', { what: 'mark', name: 'm1' }),
        peer('d', null),
      ],
      'p:1',
    );
    expect(texts).toEqual([{ id: 'a', name: 'Person a', color: '#2563eb', first: 2, last: 7 }]);
    expect(peerTextsOn([], 'p:1')).toBe(peerTextsOn([peer('d', null)], 'p:1'));
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
