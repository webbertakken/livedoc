// docs/specs/035-pdf-documents/marks.md "Changing a mark": a drag or an arrow key moves every selected mark, held on
// its page; Delete deletes them; each one step, made under the person's own origin; "Telemetry and observability":
// each kind's name.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { MARK_KINDS, Mark, PageName, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import {
  deleteMarks,
  MARK_KIND_LABELS,
  MARK_KIND_NAMES,
  markControlName,
  moveMarks,
  reshapeMark,
} from './pdf-mark-change';
import { SHAPE_NAMES } from './pdf-shape';
import { TEXT_MARK_NAMES } from './pdf-text-mark';
import { TYPED_NAMES } from './pdf-typed';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const page = PageName.ofObject(4);
const T = 1_795_000_000_000;
const BASE = { page, colour: '#ff0000', opacity: 1, author: 'Ada', createdAt: T };
const QUAD: Quad = [100, 716, 200, 716, 100, 700, 200, 700];

function withMarks() {
  const doc = PdfLiveChanges.load();
  const line = Mark.line('line', { ...BASE, id: 'l', line: [10, 10, 50, 60], width: 2 })!;
  const stamp = Mark.stamp({
    ...BASE,
    id: 's',
    rect: [10, 700, 110, 740],
    stamp: 'approved',
    lines: ['APPROVED'],
  })!;
  const highlight = Mark.highlight({ ...BASE, id: 'h', quads: [QUAD], text: 'x' })!;
  for (const mark of [line, stamp, highlight]) PdfLiveChanges.addMark(doc, mark);
  const origins: unknown[] = [];
  doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin));
  return { doc, line, stamp, highlight, origins };
}

describe('MARK_KIND_NAMES', () => {
  it('names every kind as its tool and its making do', () => {
    expect(Object.keys(MARK_KIND_NAMES).sort()).toEqual([...MARK_KINDS].sort());
    expect(MARK_KIND_NAMES).toMatchObject({
      ...TEXT_MARK_NAMES,
      ...SHAPE_NAMES,
      ...TYPED_NAMES,
      drawing: 'Drawing',
      stamp: 'Stamp',
    });
  });
});

// marks.md "Keyboard and accessibility": each mark's control is named for its kind and author.
describe('markControlName', () => {
  it('names a mark by its kind and who made it', () => {
    expect(Object.keys(MARK_KIND_LABELS).sort()).toEqual([...MARK_KINDS].sort());
    expect(markControlName({ kind: 'squiggly', author: 'Ada Lovelace' })).toBe(
      'Squiggly underline by Ada Lovelace',
    );
    expect(markControlName({ kind: 'stamp', author: '  ' })).toBe('Stamp');
  });
});

describe('moveMarks', () => {
  it('moves each movable mark whole as one step under the person’s origin', () => {
    const { doc, line, stamp, origins } = withMarks();
    expect(moveMarks(doc, ['l', 's'], { x: 5, y: -5 }, T + 9)).toBe(2);
    expect(PdfLiveChanges.mark(doc, 'l')).toEqual({
      ...line,
      line: [15, 5, 55, 55],
      modifiedAt: T + 9,
    });
    expect(PdfLiveChanges.mark(doc, 's')).toEqual({
      ...stamp,
      rect: [15, 695, 115, 735],
      modifiedAt: T + 9,
    });
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('moves no text mark and no mark that is gone, and changes nothing for no offset', () => {
    const { doc, highlight, origins } = withMarks();
    expect(moveMarks(doc, ['h', 'gone'], { x: 5, y: 5 }, T + 9)).toBe(0);
    expect(PdfLiveChanges.mark(doc, 'h')).toEqual(highlight);
    expect(moveMarks(doc, ['l'], { x: 0, y: 0 }, T + 9)).toBe(0);
    expect(origins).toEqual([]);
  });
});

describe('reshapeMark', () => {
  it('gives a mark new geometry as one step under the person’s origin, answering its kind', () => {
    const { doc, line, origins } = withMarks();
    expect(reshapeMark(doc, 'l', { line: [0, 0, 9, 9] }, T + 9)).toBe('line');
    expect(PdfLiveChanges.mark(doc, 'l')).toEqual({
      ...line,
      line: [0, 0, 9, 9],
      modifiedAt: T + 9,
    });
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('changes nothing for a mark that is gone', () => {
    const { doc, origins } = withMarks();
    expect(reshapeMark(doc, 'gone', { line: [0, 0, 9, 9] }, T + 9)).toBeNull();
    expect(origins).toEqual([]);
  });
});

describe('deleteMarks', () => {
  it('deletes every mark named as one step, answering the kinds deleted', () => {
    const { doc, origins } = withMarks();
    expect(deleteMarks(doc, ['l', 'h', 'gone'])).toEqual(['line', 'highlight']);
    expect(PdfLiveChanges.marks(doc).map((mark) => mark.id)).toEqual(['s']);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('changes nothing where no mark named is there', () => {
    const { doc, origins } = withMarks();
    expect(deleteMarks(doc, ['gone'])).toEqual([]);
    expect(origins).toEqual([]);
  });
});
