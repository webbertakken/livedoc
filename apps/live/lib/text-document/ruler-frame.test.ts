// docs/specs/034-text-documents/editing-surface.md "The ruler", "In a section of columns": the columns the ruler cuts
// the text area into, the caret's column read from a point, and the frame its markers are measured in.
import { describe, expect, it } from 'vitest';
import { PageSetup } from '@livedoc/text-documents';
import { columnAt, rulerFrame, rulerSpans } from './ruler-frame';

// Letter: 612 pt wide, 1 in margins, so 468 pt of text.
const letter = PageSetup.of('letter');
const two = { ...letter, columns: { count: 2, gap: 36 } };
const three = { ...letter, columns: { count: 3, gap: 18 } };

describe('rulerSpans', () => {
  it('is the text area as one span with one column', () => {
    expect(rulerSpans(letter, false)).toEqual([{ start: 72, end: 540 }]);
  });

  it('cuts the text area at each gap', () => {
    expect(rulerSpans(two, false)).toEqual([
      { start: 72, end: 288 },
      { start: 324, end: 540 },
    ]);
    expect(rulerSpans(three, false)).toEqual([
      { start: 72, end: 216 },
      { start: 234, end: 378 },
      { start: 396, end: 540 },
    ]);
  });

  it('is one span pageless, whatever the section holds', () => {
    expect(rulerSpans(two, true)).toEqual([{ start: 72, end: 540 }]);
  });
});

describe('columnAt', () => {
  const spans = rulerSpans(two, false);

  it('is the span a point falls in', () => {
    expect(columnAt(spans, 100)).toBe(0);
    expect(columnAt(spans, 400)).toBe(1);
  });

  it('is the nearer column in a gap, and the first or last outside', () => {
    expect(columnAt(spans, 300)).toBe(0);
    expect(columnAt(spans, 315)).toBe(1);
    expect(columnAt(spans, 10)).toBe(0);
    expect(columnAt(spans, 600)).toBe(1);
  });
});

describe('rulerFrame', () => {
  it('measures from the caret column', () => {
    const frame = rulerFrame(two, false, 1);
    expect(frame).toMatchObject({ width: 612, column: 1, origin: 324, end: 540 });
    expect(frame.spans).toHaveLength(2);
  });

  it('clamps a column past the count', () => {
    expect(rulerFrame(two, false, 4)).toMatchObject({ column: 1, origin: 324 });
    expect(rulerFrame(letter, false, 2)).toMatchObject({ column: 0, origin: 72, end: 540 });
  });
});
