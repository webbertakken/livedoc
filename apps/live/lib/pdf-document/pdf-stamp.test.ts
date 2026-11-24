// docs/specs/035-pdf-documents/marks.md "Stamps": a stamp's colour by its tone; a dynamic stamp's second line, the
// display name and the browser's date and 24-hour time; placed at its natural size, at most a third of the page's
// width, centred on the press and moved onto the page; "Limits": PDF_MAX_MARKS; live-editing-and-storage.md
// "The layout".
import { describe, expect, it } from 'vitest';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  PageName,
  PDF_MAX_MARKS,
  PdfLiveChanges,
  StampLayout,
  Stamps,
  type Box,
} from '@livedoc/pdf-documents';
import {
  addStamp,
  placeStamp,
  STAMP_COLOURS,
  stampKindName,
  stampLines,
  stampWhen,
} from './pdf-stamp';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };
const page = PageName.ofObject(4);
const LETTER: Box = [0, 0, 612, 792];
// 21 November 2026, 14:02 in this browser's own time.
const NOW = new Date(2026, 10, 21, 14, 2, 30).getTime();
const approved = Stamps.of('approved')!;
const approvedBy = Stamps.of('approved-by')!;

const strong = (name: string) =>
  standardColours('strong', 'light').find((colour) => colour.name === name)!.hex;

describe('a stamp’s colour', () => {
  it('is the colour picker’s strong tone for light paper of its tone', () => {
    expect(STAMP_COLOURS).toEqual({
      green: strong('green'),
      red: strong('red'),
      blue: strong('blue'),
    });
  });
});

describe('stampWhen', () => {
  it('reads the browser’s date and 24-hour time, the month cut to three letters', () => {
    expect(stampWhen(NOW)).toBe('21 Nov 2026, 14:02');
    expect(stampWhen(new Date(2026, 8, 3, 9, 5).getTime())).toBe('3 Sep 2026, 09:05');
    expect(stampWhen(new Date(2027, 0, 1, 0, 0).getTime())).toBe('1 Jan 2027, 00:00');
  });
});

describe('stampLines', () => {
  it('draws a standard stamp’s name in capitals, alone', () => {
    expect(stampLines(Stamps.of('not-for-public-release')!, { author: 'Ada', now: NOW })).toEqual([
      'NOT FOR PUBLIC RELEASE',
    ]);
  });

  it('adds a dynamic stamp’s second line: who placed it, and when', () => {
    expect(stampLines(approvedBy, { author: 'Ada Lovelace', now: NOW })).toEqual([
      'APPROVED',
      'by Ada Lovelace, 21 Nov 2026, 14:02',
    ]);
  });

  it('says the time alone where the person has no name to give', () => {
    expect(stampLines(approvedBy, { author: '  ', now: NOW })).toEqual([
      'APPROVED',
      '21 Nov 2026, 14:02',
    ]);
  });
});

describe('stampKindName', () => {
  it('names a stamp’s category in telemetry', () => {
    expect(stampKindName(approved)).toBe('Standard');
    expect(stampKindName(approvedBy)).toBe('Dynamic');
  });
});

describe('placeStamp', () => {
  const lines = ['APPROVED'];
  const natural = StampLayout.natural(lines);

  it('places a stamp at its natural size, centred on the press', () => {
    const placed = placeStamp(lines, { x: 300, y: 400 }, LETTER);
    const wanted = [
      300 - natural.width / 2,
      400 - natural.height / 2,
      300 + natural.width / 2,
      400 + natural.height / 2,
    ];
    placed.forEach((n, at) => expect(n).toBeCloseTo(wanted[at]!, 9));
  });

  it('is at most a third of the page’s width, kept in proportion', () => {
    const narrow: Box = [0, 0, natural.width * 1.5, 792];
    const [left, bottom, right, top] = placeStamp(
      lines,
      { x: natural.width * 0.75, y: 400 },
      narrow,
    );
    expect(right - left).toBeCloseTo(natural.width / 2, 9);
    expect(top - bottom).toBeCloseTo(natural.height / 2, 9);
  });

  it('is moved onto its page where it would leave it, at any side', () => {
    const [left, bottom] = placeStamp(lines, { x: 2, y: 1 }, LETTER);
    expect([left, bottom]).toEqual([0, 0]);
    const [, , right, top] = placeStamp(lines, { x: 611, y: 791 }, LETTER);
    expect([right, top]).toEqual([612, 792]);
    const [offsetLeft] = placeStamp(lines, { x: 50, y: 400 }, [40, 0, 652, 792]);
    expect(offsetLeft).toBe(40);
  });
});

describe('addStamp', () => {
  const by = (id: string) => ({ author: 'Ada Lovelace', now: NOW, id });

  it('makes the stamp, in its colour, centred on the press, as one change that names the stored file', () => {
    const doc = PdfLiveChanges.load();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const made = addStamp(
      doc,
      { page, stored, box: LETTER },
      approvedBy,
      { x: 300, y: 400 },
      by('s1'),
    );
    expect(made.ok).toBe(true);
    const lines = ['APPROVED', 'by Ada Lovelace, 21 Nov 2026, 14:02'];
    expect(PdfLiveChanges.marks(doc)).toEqual([
      {
        id: 's1',
        kind: 'stamp',
        page,
        rect: placeStamp(lines, { x: 300, y: 400 }, LETTER),
        stamp: 'approved-by',
        lines,
        colour: strong('green'),
        opacity: 1,
        author: 'Ada Lovelace',
        createdAt: NOW,
        modifiedAt: NOW,
      },
    ]);
    expect(PdfLiveChanges.stored(doc)).toEqual(stored);
    expect(origins).toEqual([PDF_LOCAL_ORIGIN]);
  });

  it('keeps the stored file named before, beside a mark made before it', () => {
    const doc = PdfLiveChanges.load();
    addStamp(doc, { page, stored, box: LETTER }, approved, { x: 100, y: 100 }, by('a1'));
    addStamp(
      doc,
      { page, stored, box: LETTER },
      Stamps.of('rejected')!,
      { x: 300, y: 300 },
      by('a2'),
    );
    expect(PdfLiveChanges.marks(doc).map((mark) => mark.colour)).toEqual([
      strong('green'),
      strong('red'),
    ]);
  });

  it('makes nothing of a page with no room to place it', () => {
    const doc = PdfLiveChanges.load();
    const nowhere: Box = [Infinity, Infinity, -Infinity, -Infinity];
    expect(
      addStamp(doc, { page, stored, box: nowhere }, approved, { x: 1, y: 1 }, by('s1')),
    ).toEqual({
      ok: false,
      reason: 'no_stamp',
    });
    expect(PdfLiveChanges.marks(doc)).toEqual([]);
  });

  it('is refused past PDF_MAX_MARKS', () => {
    const doc = PdfLiveChanges.load();
    doc.transact(() => {
      const marks = doc.getMap('marks');
      for (let n = 0; n < PDF_MAX_MARKS; n += 1) marks.set(`m${n}`, 1);
    });
    expect(
      addStamp(doc, { page, stored, box: LETTER }, approved, { x: 1, y: 1 }, by('s1')),
    ).toEqual({
      ok: false,
      reason: 'pdf_too_many_marks',
    });
  });
});
