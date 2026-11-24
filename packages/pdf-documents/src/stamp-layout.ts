// How a stamp is drawn in LiveDoc's style (docs/specs/035-pdf-documents/marks.md "Stamps"): a box with rounded corners
// and a border, the stamp's name in capitals in Helvetica Bold, a dynamic stamp's second line in Helvetica, each line
// centred; in the mark faces where Helvetica cannot write a line ("Words in every script"). Its natural size is what its words need; in a box of any other size it is scaled, kept in proportion and
// centred. Pure, so the surface's overlay, the canvas pictures and the appearance a bake writes draw one stamp the same.
import type { PagePoint } from './engine-contract';
import { Helvetica } from './helvetica';
import { HelveticaBold } from './helvetica-bold';
import type { StampMark } from './mark';
import type { MarkFaceRegion } from './mark-face-families';
import { MarkFaces, type MarkFaceSet } from './mark-faces';
import type { MarkStroke } from './mark-drawing';
import type { PlacedLine } from './typed-layout';

/** (default) The name's size, in points, at a stamp's natural size. */
export const STAMP_NAME_PT = 18;
/** (default) A dynamic stamp's second line's size, in points. */
export const STAMP_DETAIL_PT = 8;
/** (default) The border's width, in points. */
export const STAMP_BORDER_PT = 2;
/** (default) Room between the border and the words, in points. */
export const STAMP_PADDING_PT = 5;
/** (default) The corners' radius, in points. */
export const STAMP_RADIUS_PT = 4;
/** (default) Room between the name and the second line, in points. */
export const STAMP_LINE_GAP_PT = 3;

/** Points along each rounded corner, its ends included: round to the eye at any size a page holds. */
const CORNER_POINTS = 7;

const INSET = STAMP_BORDER_PT + STAMP_PADDING_PT;
// The name is in capitals: its line is as high as Helvetica's capitals stand, nothing below the baseline.
const NAME_HIGH = (STAMP_NAME_PT * Helvetica.ascent) / 1000;
const DETAIL_ASCENT = (STAMP_DETAIL_PT * Helvetica.ascent) / 1000;
const DETAIL_HIGH = (STAMP_DETAIL_PT * (Helvetica.ascent + Helvetica.descent)) / 1000;

/** A stamp's line placed on the page, with its size and face. */
export type StampLine = PlacedLine & { readonly size: number; readonly bold: boolean };

type Stamped = Pick<StampMark, 'rect' | 'lines'>;

/** Each line's size and face: the name bold, the second line plain and small. */
const faceOf = (at: number) =>
  at === 0
    ? { face: HelveticaBold, size: STAMP_NAME_PT, bold: true }
    : { face: Helvetica, size: STAMP_DETAIL_PT, bold: false };

/** What a stamp's lines are set in: its faces, the name bold, and the region of its Chinese, Japanese or Korean. */
type Setting = { readonly faces: MarkFaceSet; readonly region: MarkFaceRegion };
const settingOf = (lines: readonly string[]): Setting => {
  const faced = lines.map((text, at) => ({ text, bold: at === 0 }));
  return { faces: MarkFaces.setOf(faced), region: MarkFaces.regionOf(faced) };
};

const widthOf = (text: string, at: number, { faces, region }: Setting): number => {
  const { face, size, bold } = faceOf(at);
  const thousandths =
    faces === 'helvetica'
      ? Array.from(text).reduce((sum, character) => sum + face.width(character.codePointAt(0)!), 0)
      : MarkFaces.width({ text, bold, region });
  return thousandths * (size / 1000);
};

/** A corner's arc round `centre`, from `from` radians a quarter turn on. */
const arc = (centre: PagePoint, radius: number, from: number): PagePoint[] =>
  Array.from({ length: CORNER_POINTS }, (_, at) => {
    const angle = from + ((at / (CORNER_POINTS - 1)) * Math.PI) / 2;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });

export const StampLayout = {
  /** The size a stamp's words need, in points, its border and room included. */
  natural: (lines: readonly string[]): { width: number; height: number } => ({
    width: 2 * INSET + Math.max(...lines.map((text, at) => widthOf(text, at, settingOf(lines)))),
    height: 2 * INSET + NAME_HIGH + (lines.length > 1 ? STAMP_LINE_GAP_PT + DETAIL_HIGH : 0),
  }),

  /** How much a stamp is scaled from its natural size to fit its box, kept in proportion. */
  scale: ({ rect: [left, bottom, right, top], lines }: Stamped): number => {
    const { width, height } = StampLayout.natural(lines);
    return Math.min((right - left) / width, (top - bottom) / height);
  },

  /** A stamp's lines on the page: centred across, the words centred in the box's height, the name first. */
  place: (stamp: Stamped): readonly StampLine[] => {
    const [left, bottom, right, top] = stamp.rect;
    const scale = StampLayout.scale(stamp);
    const { height } = StampLayout.natural(stamp.lines);
    const middle = (left + right) / 2;
    const ceiling = (bottom + top) / 2 + (height * scale) / 2;
    const name = ceiling - (INSET + NAME_HIGH) * scale;
    const setting = settingOf(stamp.lines);
    return stamp.lines.map((text, at): StampLine => {
      const width = widthOf(text, at, setting) * scale;
      const { size, bold } = faceOf(at);
      return {
        text,
        width,
        rtl: false,
        x: middle - width / 2,
        y: at === 0 ? name : name - (STAMP_LINE_GAP_PT + DETAIL_ASCENT) * scale,
        size: size * scale,
        bold,
      };
    });
  },

  /** The faces a stamp's lines are set in. */
  faces: (stamp: Pick<StampMark, 'lines'>): MarkFaceSet => settingOf(stamp.lines).faces,

  /** The region a stamp's Chinese, Japanese or Korean is set in. */
  region: (stamp: Pick<StampMark, 'lines'>): MarkFaceRegion => settingOf(stamp.lines).region,

  /** The border: round the box just inside its edge, its corners rounded, as wide as the border scaled. */
  border: (stamp: Stamped): MarkStroke => {
    const scale = StampLayout.scale(stamp);
    const width = STAMP_BORDER_PT * scale;
    const half = width / 2;
    const [left, bottom, right, top] = stamp.rect;
    const radius = Math.min(
      STAMP_RADIUS_PT * scale,
      (right - left) / 2 - half,
      (top - bottom) / 2 - half,
    );
    const inner = {
      left: left + half + radius,
      bottom: bottom + half + radius,
      right: right - half - radius,
      top: top - half - radius,
    };
    return {
      points: [
        ...arc({ x: inner.left, y: inner.bottom }, radius, Math.PI),
        ...arc({ x: inner.right, y: inner.bottom }, radius, (3 * Math.PI) / 2),
        ...arc({ x: inner.right, y: inner.top }, radius, 0),
        ...arc({ x: inner.left, y: inner.top }, radius, Math.PI / 2),
      ],
      width,
      round: true,
      closed: true,
    };
  },
} as const;
