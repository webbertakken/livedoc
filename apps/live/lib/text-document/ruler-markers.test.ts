// docs/specs/034-text-documents/editing-surface.md "The ruler": each marker's place and value, the indents and tab
// stops measured from the caret's column ("In a section of columns"), the margins from the page's edges.
import { describe, expect, it } from 'vitest';
import { PageSetup } from '@livedoc/text-documents';
import { rulerFrame } from './ruler-frame';
import { markerKey, markerName, placeOf, sameMarker, valueOf, type Marker } from './ruler-markers';

const letter = PageSetup.of('letter');
const two = { ...letter, columns: { count: 2, gap: 36 } };
const reading = {
  indentStart: 18,
  indentFirst: 9,
  indentEnd: 27,
  stops: [{ position: 72, align: 'center' as const }],
};
const left: Marker = { kind: 'indent', marker: 'left' };
const first: Marker = { kind: 'indent', marker: 'first' };
const right: Marker = { kind: 'indent', marker: 'right' };
const stop: Marker = { kind: 'stop', stop: reading.stops[0]! };
const marginRight: Marker = { kind: 'margin', side: 'right' };

describe('placeOf and valueOf', () => {
  it('measures from the text area with one column', () => {
    const frame = rulerFrame(letter, false, 0);
    expect(placeOf(left, frame, reading)).toBe(90);
    expect(placeOf(first, frame, reading)).toBe(99);
    expect(placeOf(right, frame, reading)).toBe(513);
    expect(placeOf(stop, frame, reading)).toBe(144);
    expect(placeOf(marginRight, frame, reading)).toBe(540);
  });

  it("measures the indents and stops from the caret's column", () => {
    const frame = rulerFrame(two, false, 1);
    expect(placeOf(left, frame, reading)).toBe(342);
    expect(placeOf(first, frame, reading)).toBe(351);
    expect(placeOf(right, frame, reading)).toBe(513);
    expect(placeOf(stop, frame, reading)).toBe(396);
    expect(valueOf(left, 360, frame)).toBe(36);
    expect(valueOf(right, 504, frame)).toBe(36);
    expect(valueOf(stop, 432, frame)).toBe(108);
  });

  it("keeps the margins at the page's edges in any column", () => {
    const frame = rulerFrame(two, false, 0);
    expect(placeOf(marginRight, frame, reading)).toBe(540);
    expect(valueOf(marginRight, 540, frame)).toBe(72);
    expect(valueOf({ kind: 'margin', side: 'left' }, 90, frame)).toBe(90);
    expect(placeOf(right, frame, reading)).toBe(261);
  });
});

describe('markers by name and key', () => {
  it('names each as its tooltip does', () => {
    expect(markerName(left)).toBe('Left indent');
    expect(markerName(first)).toBe('First line indent');
    expect(markerName(right)).toBe('Right indent');
    expect(markerName(stop)).toBe('Tab stop');
    expect(markerName(marginRight)).toBe('Right margin');
    expect(markerKey(stop)).toBe('stop-72');
    expect(sameMarker(left, { kind: 'indent', marker: 'left' })).toBe(true);
    expect(sameMarker(left, first)).toBe(false);
  });
});
