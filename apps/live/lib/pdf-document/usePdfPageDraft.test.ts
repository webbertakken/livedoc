// docs/specs/035-pdf-documents/marks.md "Making a mark": a line or shape shows as it is dragged, in its tool's look, its
// line style and a Rectangle's or an Ellipse's fill included (A tool's line).
import { describe, expect, it } from 'vitest';
import { draftLook } from './usePdfPageDraft';
import type { PdfPageShaping } from './usePdfPageShape';

const shaping = (look: Partial<PdfPageShaping>): PdfPageShaping => ({
  kind: 'rectangle',
  colour: '#d93025',
  opacity: 1,
  width: 2,
  onShape: () => {},
  ...look,
});

describe('a shape being drawn', () => {
  it('takes its tool’s line style and fill', () => {
    const box = { kind: 'rectangle', rect: [0, 0, 10, 10], width: 2 } as const;
    expect(draftLook(box, shaping({ lineStyle: 'dashed', fill: '#fde68a' }))).toEqual({
      ...box,
      lineStyle: 'dashed',
      fill: '#fde68a',
    });
    expect(draftLook(box, shaping({}))).toEqual(box);
  });

  it('gives a line no fill', () => {
    const line = { kind: 'line', line: [0, 0, 10, 10], width: 2 } as const;
    expect(
      draftLook(line, shaping({ kind: 'line', lineStyle: 'dotted', fill: '#fde68a' })),
    ).toEqual({ ...line, lineStyle: 'dotted' });
  });
});
