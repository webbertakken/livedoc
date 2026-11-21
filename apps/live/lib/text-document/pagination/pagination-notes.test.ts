// Footnotes on the pages (docs/specs/034-text-documents/page-layout.md "Footnotes", "Drawn"): a page's notes take
// their height and the rule's from the foot of its text area; a line whose note does not fit below it moves to the
// next page with its mark; a note taller than the page is drawn whole.
import { describe, expect, it } from 'vitest';
import { NOTES_GAP_PX, type BlockMetrics } from './pagination';
import { paginate } from './pagination-engine';
import { pageNotes } from './pagination-notes';

const LINE = 20;
const page = { width: 400, height: 138, top: 19, bottom: 19, left: 20, textHeight: 100 };
const frame = () => page;
// From where the writing stops on one page to the next page's text top, plus that stop: 150 px a page.
const ACROSS = 150;

const para = (lines: number, rules: Partial<BlockMetrics> = {}): BlockMetrics => ({
  height: lines * LINE,
  marginTop: 0,
  marginBottom: 0,
  lines: Array.from({ length: lines }, (_, i) => ({ top: i * LINE, bottom: (i + 1) * LINE })),
  ...rules,
});

const starts = (blocks: readonly BlockMetrics[]) =>
  paginate(blocks, frame).starts.map(({ block, line, gap }) => [block, line, gap]);

describe('notes in the layout', () => {
  it('takes a page’s notes and their rule from the foot of its text area', () => {
    // A 20 px note: the foot is 100 - 20 - the rule's gap, so three lines fit and the next paragraph moves on.
    const foot = 100 - 20 - NOTES_GAP_PX;
    expect(foot).toBeGreaterThanOrEqual(60);
    expect(foot).toBeLessThan(80);
    expect(starts([para(3, { notes: [{ line: 0, height: 20 }] }), para(2)])).toEqual([
      [0, 0, 0],
      [1, 0, ACROSS - 60],
    ]);
  });

  it('moves a line whose note does not fit below it to the next page, with its mark', () => {
    expect(starts([para(4, { notes: [{ line: 3, height: 30 }] })])).toEqual([
      [0, 0, 0],
      [0, 3, ACROSS - 60],
    ]);
  });

  it('counts each page’s notes alone', () => {
    // Page 1 holds the first note; page 2 starts with none and holds the second's line and the rest.
    const blocks = [
      para(3, { notes: [{ line: 2, height: 20 }] }),
      para(2, { notes: [{ line: 1, height: 20 }] }),
      para(1),
    ];
    expect(starts(blocks)).toEqual([
      [0, 0, 0],
      [1, 0, ACROSS - 60],
    ]);
  });

  it('draws a note taller than the page whole, its line on the page', () => {
    expect(starts([para(1, { notes: [{ line: 0, height: 200 }] }), para(1)])).toEqual([
      [0, 0, 0],
      [1, 0, ACROSS - 20],
    ]);
  });

  it('gives back the notes of a paragraph that moves on whole', () => {
    // The paragraph keeps its lines together: its note goes with it, and the page's foot is its own again.
    const blocks = [para(2), para(3, { keepTogether: true, notes: [{ line: 0, height: 10 }] })];
    expect(starts(blocks)).toEqual([
      [0, 0, 0],
      [1, 0, ACROSS - 40],
    ]);
  });
});

describe('pageNotes', () => {
  it('gives each page the notes whose marks’ lines are on it, numbered through the document', () => {
    const blocks = [
      para(3, { notes: [{ line: 0, height: 20 }] }),
      para(4, { notes: [{ line: 3, height: 30 }] }),
    ];
    const pagination = paginate(blocks, frame);
    const marks = [[{ line: 0, story: 'a' }], [{ line: 3, story: 'b' }]];
    expect(pageNotes(pagination, marks, () => ({ left: 20, width: 300 }))).toEqual([
      [{ story: 'a', key: 'a@300', number: 1, left: 20, width: 300 }],
      // The second paragraph moves on whole, and its last line again with its note.
      [],
      [{ story: 'b', key: 'b@300', number: 2, left: 20, width: 300 }],
    ]);
  });
});
