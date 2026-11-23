// A picture placed out of its line (docs/specs/034-text-documents/objects.md "The model", Placement): how the text
// meets it (wrap), the space kept clear around it, whether it moves with its paragraph or stays on the page, and where
// its top left corner stands. None is in line.

export type PictureWrap = 'wrap' | 'break' | 'front' | 'behind';
export type PictureMoves = 'with-text' | 'page';

export type PictureMargin = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type PicturePlacement = {
  readonly wrap: PictureWrap;
  readonly margin: PictureMargin;
  readonly moves: PictureMoves;
  /** From its anchor's column and paragraph when it moves with text, else from the page's top left; points. */
  readonly x: number;
  readonly y: number;
};

export const PICTURE_WRAPS: readonly PictureWrap[] = ['wrap', 'break', 'front', 'behind'];
/** The widest margin around a placed picture: one inch, Google's most. */
export const PICTURE_MARGIN_MAX = 72;
/** The margin Google sets when wrapping is chosen: ⅛ inch. */
export const PICTURE_WRAP_MARGIN = 9;
/** How far a placed picture may stand from where it is measured, either way: 22 inches, Word's widest page. */
export const PICTURE_OFFSET_MAX = 1584;

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

const number = (value: unknown, low: number, high: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
    ? round3(value)
    : undefined;

export const PicturePlacements = {
  /** A placement as a picture holds one, its lengths to three decimals; none for anything else. */
  of: (value: unknown): PicturePlacement | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const v = value as Record<string, unknown>;
    if (!PICTURE_WRAPS.includes(v.wrap as PictureWrap)) return undefined;
    if (v.moves !== 'with-text' && v.moves !== 'page') return undefined;
    const x = number(v.x, -PICTURE_OFFSET_MAX, PICTURE_OFFSET_MAX);
    const y = number(v.y, -PICTURE_OFFSET_MAX, PICTURE_OFFSET_MAX);
    const m = (typeof v.margin === 'object' && v.margin !== null ? v.margin : {}) as Record<
      string,
      unknown
    >;
    const margin = SIDES.map((side) => number(m[side], 0, PICTURE_MARGIN_MAX));
    if (x === undefined || y === undefined || margin.includes(undefined)) return undefined;
    const [top, right, bottom, left] = margin as [number, number, number, number];
    return {
      wrap: v.wrap as PictureWrap,
      margin: { top, right, bottom, left },
      moves: v.moves,
      x,
      y,
    };
  },
  /** The margin on every side. */
  margin: (all: number): PictureMargin => ({ top: all, right: all, bottom: all, left: all }),
} as const;
