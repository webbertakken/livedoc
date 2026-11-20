// A block's lines read from its measured rectangles (docs/specs/034-text-documents/page-layout.md "A page fills").
import { describe, expect, it } from 'vitest';
import { groupLines, naturalOf, withoutSpacers } from './pagination-lines';

const rect = (top: number, bottom: number) => ({ top, bottom });

describe('groupLines', () => {
  it('makes one line of the rectangles that overlap, touching from the content top to its bottom', () => {
    // Two lines of 16 px text 20 px apart, the first holding a smaller run and a superscript.
    const lines = groupLines(
      [rect(2, 18), rect(5, 17), rect(0, 12), rect(22, 38), rect(22, 38)],
      0,
      40,
    );
    expect(lines).toEqual([
      { top: 0, bottom: 20 },
      { top: 20, bottom: 40 },
    ]);
  });

  it('reads lines set closer than their text, and ignores empty rectangles', () => {
    // Line spacing 0.8: 20 px text 16 px apart overlaps by 4 px, under half its height.
    const lines = groupLines([rect(0, 20), rect(16, 36), rect(30, 30), rect(32, 52)], 0, 52);
    expect(lines.map((l) => [l.top, l.bottom])).toEqual([
      [0, 18],
      [18, 34],
      [34, 52],
    ]);
  });

  it('reads an empty paragraph as one line over its content box', () => {
    expect(groupLines([], 4, 24)).toEqual([{ top: 4, bottom: 24 }]);
  });
});

describe('withoutSpacers', () => {
  it('leaves out what lies in a spacer and closes the spacers up', () => {
    // A 100 px spacer from 40 to 140 inside a paragraph of lines 20 px high.
    const spacers = [rect(40, 140)];
    expect(
      withoutSpacers([rect(0, 20), rect(20, 40), rect(40, 140), rect(140, 160)], spacers),
    ).toEqual([rect(0, 20), rect(20, 40), rect(40, 60)]);
    expect(naturalOf(150, spacers)).toBe(50);
    expect(naturalOf(30, spacers)).toBe(30);
  });
});
