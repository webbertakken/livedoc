// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties reads a mark's kind, author, subject, dates and
// look; its subject changed is one change, its kind's name or nothing taking it back to none; "Make this look the
// default" gives its kind's tool its look, never a stamp's.
import { afterEach, describe, expect, it } from 'vitest';
import { standardColours } from '@livedoc/document';
import { Mark, PageName, PDF_MARK_SUBJECT_MAX_CHARS, PdfLiveChanges } from '@livedoc/pdf-documents';
import { markLooks, resetMarkLooks } from './pdf-mark-looks';
import {
  angleShown,
  angleTyped,
  changeSubject,
  defaultLook,
  mayDefaultLook,
  propertyRows,
  subjectShown,
} from './pdf-mark-properties';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const T = new Date(2026, 10, 21, 14, 2).getTime();
// A standard colour, named as the colour picker names it, and one that is none.
const BLUE = standardColours('strong', 'light').find((colour) => colour.name === 'blue')!;
const OTHER = '#123456';
const BASE = {
  page: PageName.ofObject(3),
  colour: BLUE.hex.toLowerCase(),
  opacity: 0.5,
  author: 'Ada Lovelace',
  createdAt: T,
};
const box = Mark.shape('rectangle', {
  ...BASE,
  id: 'r',
  rect: [0, 0, 9, 9],
  width: 4,
  lineStyle: 'dashed',
  fill: OTHER,
})!;
const highlight = Mark.highlight({
  ...BASE,
  id: 'h',
  quads: [[0, 9, 9, 9, 0, 0, 9, 0]],
  text: 'Lease',
})!;
const stamp = Mark.stamp({
  ...BASE,
  id: 's',
  stamp: 'approved',
  rect: [0, 0, 90, 30],
  lines: ['APPROVED'],
})!;

afterEach(() => {
  localStorage.clear();
  resetMarkLooks();
});

describe('propertyRows', () => {
  it('reads a shape’s kind and author, then its dates and whole look', () => {
    expect(propertyRows(box)).toEqual({
      before: [
        { label: 'Kind', value: 'Rectangle' },
        { label: 'Author', value: 'Ada Lovelace' },
      ],
      after: [
        { label: 'Made', value: '21 Nov 2026, 14:02' },
        { label: 'Changed', value: '21 Nov 2026, 14:02' },
        { label: 'Colour', value: BLUE.label },
        { label: 'Opacity', value: '50%' },
      ],
      last: [
        { label: 'Line width', value: '4 pt' },
        { label: 'Line style', value: 'Dashed' },
        { label: 'Fill', value: OTHER },
      ],
    });
  });

  it('reads a text mark’s words, and an unknown author', () => {
    const rows = propertyRows({ ...highlight, author: ' ' });
    expect(rows.before[1]).toEqual({ label: 'Author', value: 'Unknown' });
    expect(rows.after.map((row) => row.label)).toEqual(['Made', 'Changed', 'Colour', 'Opacity']);
    expect(rows.last).toEqual([{ label: 'Words', value: 'Lease' }]);
  });
});

// marks.md "Changing a mark": Rotate, Properties' Angle.
describe('the Angle', () => {
  it('shows a boxed mark’s angle as it stands, and none for a mark with no box to turn', () => {
    expect(angleShown(box)).toBe('0');
    expect(angleShown({ ...box, turn: 37 })).toBe('37');
    expect(angleShown(highlight)).toBeNull();
  });

  it('takes what is typed to the nearest 15° within 0 to 359, and refuses what is no number', () => {
    expect(angleTyped('37')).toBe(30);
    expect(angleTyped(' 50° ')).toBe(45);
    expect(angleTyped('-90')).toBe(270);
    expect(angleTyped('720')).toBe(0);
    expect(angleTyped('')).toBeNull();
    expect(angleTyped('tilt')).toBeNull();
  });
});

describe('changeSubject', () => {
  it('gives a mark its subject as one change, and its kind’s name or nothing takes it back', () => {
    const doc = PdfLiveChanges.load();
    PdfLiveChanges.addMark(doc, box);
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    expect(subjectShown(box)).toBe('Rectangle');
    expect(changeSubject(doc, 'r', '  Check this  ', T + 1, new Map())).toEqual({ cleared: false });
    expect(PdfLiveChanges.mark(doc, 'r')).toMatchObject({
      subject: 'Check this',
      modifiedAt: T + 1,
    });
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
    expect(changeSubject(doc, 'r', 'Check this', T + 2, new Map())).toBeNull();
    expect(changeSubject(doc, 'r', 'Rectangle', T + 3, new Map())).toEqual({ cleared: true });
    expect(PdfLiveChanges.mark(doc, 'r')).not.toHaveProperty('subject');
    expect(changeSubject(doc, 'r', '', T + 4, new Map())).toBeNull();
  });

  it('cuts a subject to its most, takes a file’s own mark as LiveDoc’s, and does nothing for a mark gone', () => {
    const doc = PdfLiveChanges.load();
    const own = { ...box, id: 'o:7' };
    changeSubject(
      doc,
      'o:7',
      'x'.repeat(PDF_MARK_SUBJECT_MAX_CHARS + 5),
      T + 1,
      new Map([['o:7', own]]),
    );
    expect(PdfLiveChanges.mark(doc, 'o:7')?.subject).toHaveLength(PDF_MARK_SUBJECT_MAX_CHARS);
    expect(changeSubject(doc, 'gone', 'x', T, new Map())).toBeNull();
  });
});

describe('defaultLook', () => {
  it('gives a shape’s tool its colour, width, line style and fill', () => {
    defaultLook(box);
    expect(markLooks().rectangle).toMatchObject({
      colour: BLUE.hex.toLowerCase(),
      width: 4,
      lineStyle: 'dashed',
      fill: OTHER,
    });
  });

  it('gives a text tool its colour alone, and is not offered for a stamp', () => {
    defaultLook(highlight);
    expect(markLooks().highlight.colour).toBe(BLUE.hex.toLowerCase());
    expect(mayDefaultLook(stamp)).toBe(false);
    expect(mayDefaultLook(box)).toBe(true);
  });
});
