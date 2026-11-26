// marks.md "Stamps": LiveDoc's style, a rounded box with a 2-point border, the name in capitals in Helvetica Bold at 18
// points and a dynamic stamp's second line in Helvetica at 8, each line centred.
import { describe, expect, it } from 'vitest';
import { Helvetica } from './helvetica';
import { HelveticaBold } from './helvetica-bold';
import type { Box } from './mark';
import { MarkFaces } from './mark-faces';
import {
  STAMP_BORDER_PT,
  STAMP_DETAIL_PT,
  STAMP_LINE_GAP_PT,
  STAMP_NAME_PT,
  STAMP_PADDING_PT,
  StampLayout,
} from './stamp-layout';

const measure = (text: string, face: typeof Helvetica, size: number): number =>
  Array.from(text).reduce((sum, character) => sum + face.width(character.codePointAt(0)!), 0) *
  (size / 1000);

const INSET = STAMP_BORDER_PT + STAMP_PADDING_PT;
const NAME_HIGH = (STAMP_NAME_PT * Helvetica.ascent) / 1000;
const DETAIL = 'by Ada Lovelace, 21 Nov 2026, 14:02';

describe('StampLayout.natural', () => {
  it('sizes a stamp of one line to its name in Helvetica Bold and the room round it', () => {
    expect(StampLayout.natural(['APPROVED'])).toEqual({
      width: 2 * INSET + measure('APPROVED', HelveticaBold, STAMP_NAME_PT),
      height: 2 * INSET + NAME_HIGH,
    });
  });

  it('sizes a dynamic stamp to its widest line, its second line in Helvetica below', () => {
    const { width, height } = StampLayout.natural(['APPROVED', DETAIL]);
    expect(width).toBeCloseTo(2 * INSET + measure(DETAIL, Helvetica, STAMP_DETAIL_PT), 9);
    expect(height).toBeCloseTo(
      2 * INSET +
        NAME_HIGH +
        STAMP_LINE_GAP_PT +
        (STAMP_DETAIL_PT * (Helvetica.ascent + Helvetica.descent)) / 1000,
      9,
    );
  });
});

describe('StampLayout.place', () => {
  const natural = StampLayout.natural(['APPROVED', DETAIL]);
  const at = (left: number, bottom: number, scale: number): Box => [
    left,
    bottom,
    left + natural.width * scale,
    bottom + natural.height * scale,
  ];

  it('sets the name bold and the second line plain, each centred, from the top of the box down', () => {
    const rect = at(100, 600, 1);
    const [name, detail] = StampLayout.place({ rect, lines: ['APPROVED', DETAIL] });
    const middle = (rect[0] + rect[2]) / 2;
    expect(name).toMatchObject({ text: 'APPROVED', bold: true, rtl: false });
    expect(name!.size).toBeCloseTo(STAMP_NAME_PT, 9);
    expect(name!.x + name!.width / 2).toBeCloseTo(middle, 9);
    expect(name!.y).toBeCloseTo(rect[3] - INSET - NAME_HIGH, 9);
    expect(detail).toMatchObject({ text: DETAIL, bold: false });
    expect(detail!.size).toBeCloseTo(STAMP_DETAIL_PT, 9);
    expect(detail!.x).toBeCloseTo(rect[0] + INSET, 9);
    expect(detail!.y).toBeCloseTo(
      name!.y - STAMP_LINE_GAP_PT - (STAMP_DETAIL_PT * Helvetica.ascent) / 1000,
      9,
    );
  });

  it('scales everything with its box, kept in proportion and centred', () => {
    const [name] = StampLayout.place({ rect: at(0, 0, 0.5), lines: ['APPROVED', DETAIL] });
    expect(name!.size).toBeCloseTo(STAMP_NAME_PT / 2, 9);
    expect(name!.width).toBeCloseTo(measure('APPROVED', HelveticaBold, STAMP_NAME_PT) / 2, 9);
    // A box twice as high as its words need: the words sit in its middle.
    const tall: Box = [0, 0, natural.width, natural.height * 2];
    const [high] = StampLayout.place({ rect: tall, lines: ['APPROVED', DETAIL] });
    expect(high!.size).toBeCloseTo(STAMP_NAME_PT, 9);
    expect(high!.y).toBeCloseTo(natural.height * 1.5 - INSET - NAME_HIGH, 9);
  });
});

describe('StampLayout.border', () => {
  it('runs round the box inside its edge, its corners rounded, as wide as the scaled border', () => {
    const rect: Box = [100, 600, 200, 640];
    const border = StampLayout.border({ rect, lines: ['DRAFT'] });
    const scale = StampLayout.scale({ rect, lines: ['DRAFT'] });
    expect(border.closed).toBe(true);
    expect(border.round).toBe(true);
    expect(border.width).toBeCloseTo(STAMP_BORDER_PT * scale, 9);
    const half = border.width / 2;
    const xs = border.points.map((point) => point.x);
    const ys = border.points.map((point) => point.y);
    expect(Math.min(...xs)).toBeCloseTo(100 + half, 9);
    expect(Math.max(...xs)).toBeCloseTo(200 - half, 9);
    expect(Math.min(...ys)).toBeCloseTo(600 + half, 9);
    expect(Math.max(...ys)).toBeCloseTo(640 - half, 9);
    // No corner point itself: the corner is cut round.
    expect(border.points).not.toContainEqual({ x: 100 + half, y: 600 + half });
  });
});

// marks.md "Words in every script": a stamp whose second line Helvetica cannot write is measured in the mark faces.
describe('StampLayout in the mark faces', () => {
  it('measures the name in the bold mark faces and the second line in the regular', () => {
    const lines = ['APPROVED', 'by Ελένη'];
    expect(StampLayout.faces({ lines })).toBe('embedded');
    const name = (MarkFaces.width({ text: 'APPROVED', bold: true }) * STAMP_NAME_PT) / 1000;
    const second = (MarkFaces.width({ text: 'by Ελένη', bold: false }) * STAMP_DETAIL_PT) / 1000;
    expect(StampLayout.natural(lines).width).toBeCloseTo(
      2 * (STAMP_BORDER_PT + STAMP_PADDING_PT) + Math.max(name, second),
    );
    expect(StampLayout.faces({ lines: ['APPROVED'] })).toBe('helvetica');
  });
});

// marks.md "Stamps": a dynamic stamp's third line, the person's stamp identity, below its second in the same face.
describe('StampLayout with a third line', () => {
  const IDENTITY = 'Chief Engineer, Analytical Ltd';
  const lines = ['APPROVED', DETAIL, IDENTITY];
  const DETAIL_HIGH = (STAMP_DETAIL_PT * (Helvetica.ascent + Helvetica.descent)) / 1000;

  it('grows the box by a detail line and its gap', () => {
    const two = StampLayout.natural(['APPROVED', DETAIL]);
    const three = StampLayout.natural(lines);
    expect(three.width).toBeCloseTo(two.width, 9);
    expect(three.height).toBeCloseTo(two.height + STAMP_LINE_GAP_PT + DETAIL_HIGH, 9);
  });

  it('sets the third line plain, centred, a detail line and its gap below the second', () => {
    const natural = StampLayout.natural(lines);
    const rect: Box = [100, 600, 100 + natural.width, 600 + natural.height];
    const [, detail, identity] = StampLayout.place({ rect, lines });
    expect(identity).toMatchObject({ text: IDENTITY, bold: false });
    expect(identity!.size).toBeCloseTo(STAMP_DETAIL_PT, 9);
    expect(identity!.x + identity!.width / 2).toBeCloseTo((rect[0] + rect[2]) / 2, 9);
    expect(identity!.y).toBeCloseTo(detail!.y - STAMP_LINE_GAP_PT - DETAIL_HIGH, 9);
    // The words still fill the box: the last line's descent sits on the inset.
    const descent = (STAMP_DETAIL_PT * Helvetica.descent) / 1000;
    expect(identity!.y - descent).toBeCloseTo(rect[1] + INSET, 9);
  });
});

describe('StampLayout.clip', () => {
  it('leaves a stamp of one or two lines, and a third that fits, as they are', () => {
    expect(StampLayout.clip(['APPROVED'])).toEqual(['APPROVED']);
    expect(StampLayout.clip(['APPROVED', DETAIL])).toEqual(['APPROVED', DETAIL]);
    expect(StampLayout.clip(['APPROVED', DETAIL, 'Chief'])).toEqual(['APPROVED', DETAIL, 'Chief']);
  });

  it('cuts a third line wider than the widest other with an ellipsis, never wider than it', () => {
    const long = 'Chief Engineer of the Analytical Engine, Analytical Society of London';
    const [, , third] = StampLayout.clip(['APPROVED', DETAIL, long]);
    expect(third!.endsWith('…')).toBe(true);
    expect(long.startsWith(third!.slice(0, -1))).toBe(true);
    const widest = measure(DETAIL, Helvetica, STAMP_DETAIL_PT);
    expect(measure(third!, Helvetica, STAMP_DETAIL_PT)).toBeLessThanOrEqual(widest);
    // One character more would not fit.
    const more = `${long.slice(0, third!.length)}…`;
    expect(measure(more, Helvetica, STAMP_DETAIL_PT)).toBeGreaterThan(widest);
    // The box is the two lines' width: the third never grows it.
    expect(StampLayout.natural(StampLayout.clip(['APPROVED', DETAIL, long])).width).toBeCloseTo(
      StampLayout.natural(['APPROVED', DETAIL]).width,
      9,
    );
  });

  it('drops the spaces before the ellipsis', () => {
    const [, , third] = StampLayout.clip(['OK', 'by Al', 'ab cdefghijklmnop']);
    expect(third).not.toMatch(/\s…$/);
    expect(third!.endsWith('…')).toBe(true);
  });
});
