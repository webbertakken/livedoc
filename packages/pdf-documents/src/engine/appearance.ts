// A mark's appearance stream (docs/specs/035-pdf-documents/marks.md "In the file"): what the page shows of it, as
// MarkDrawing says, and a Text's, a Callout's or a stamp's words set as MarkWords places them, in the operators of a
// PDF's content, so every reader draws exactly what was made. Pure: the bake wraps it in a stream with its box, the
// fonts it names where words are set, and, where the opacity is under 1, a graphics state of that name. Words in the
// mark faces ("Words in every script") are set run by run as the bake's typesetter shapes them, glyph by glyph.
import { Helvetica } from '../helvetica';
import type { Box } from '../mark';
import type { MarkDrawing } from '../mark-drawing';
import { MarkFaces, type FacedLine, type MarkRun } from '../mark-faces';
import { inVisualOrder } from './bidi-order';
import type { MarkWords, WordLine } from '../mark-words';
import type { ShapedGlyph, ShapedRun } from './typesetter';

/** The graphics state an appearance draws through where its opacity is under 1. */
export const APPEARANCE_STATE = 'LDa';
/** The font an appearance sets words in: Helvetica, written in WinAnsi. */
export const APPEARANCE_FONT = 'Helv';
/** The font a stamp's name is set in: Helvetica Bold, written in WinAnsi. */
export const APPEARANCE_BOLD_FONT = 'HeBo';
export type AppearanceFont = typeof APPEARANCE_FONT | typeof APPEARANCE_BOLD_FONT;
/** What a mark face's font is named in an appearance: this, then its place among the faces it sets. */
export const APPEARANCE_FACE = 'LDf';

/** A mark face an appearance sets words in: the name it gives it, and the glyphs it sets in it. */
export type AppearanceFace = {
  readonly name: string;
  readonly face: string;
  readonly glyphs: readonly ShapedGlyph[];
};

/**
 * How a bake sets runs in the mark faces: each shaped, each glyph's advance as the font's `W` says it, and a line's
 * embedding levels, one per code unit, so its runs are set in visual order; a run as the faces it is shaped in (a
 * region's slice by slice).
 */
export type RunSetter = {
  readonly shape: (run: MarkRun, rtl: boolean) => ShapedRun;
  readonly advance: (face: string, glyph: number) => number;
  readonly levels: (text: string, rtl: boolean) => readonly number[];
  readonly split: (run: MarkRun) => readonly MarkRun[];
};

export type Appearance = {
  /** The content stream's operators. */
  readonly content: string;
  /** What the content covers in page space, every line whole: the stream's `BBox` and the mark's `Rect`. */
  readonly box: Box;
  /** The opacity the graphics state carries; null where the mark is opaque. */
  readonly opacity: number | null;
  /** The fonts its words are set in, each once, in the order first set. */
  readonly fonts: readonly AppearanceFont[];
  /** The mark faces its words are set in, each once, in the order first set. */
  readonly faces: readonly AppearanceFace[];
};

/** A mark's words are in the mark faces, and the bake has no typesetter for them. */
export class NoRunSetter extends Error {
  override readonly name = 'NoRunSetter';
}

/**
 * A colour channel as the file holds it, a fraction: the middle of its byte's step, so a reader that cuts the fraction
 * back to a byte (PDFium does) reads the byte it was, and the colour comes back as it was made.
 */
export const channelOf = (colour: string, at: number): number =>
  Math.min(1, (parseInt(colour.slice(at, at + 2), 16) + 0.5) / 255);

// A number as the content writes it: a few places, no exponent (a PDF number has none), no trailing zeros.
const num = (n: number, places = 2): string => String(+n.toFixed(places));

const rgbOf = (colour: string): string =>
  [1, 3, 5].map((at) => num(channelOf(colour, at), 3)).join(' ');

/** A line of words as a PDF string in WinAnsi: its brackets and backslashes escaped, every byte past ASCII in octal. */
export function winAnsiString(text: string): string {
  const bytes = Array.from(text, (character) => Helvetica.code(character.codePointAt(0)!));
  const escaped = bytes.map((code) => {
    const character = String.fromCharCode(code);
    if (character === '(' || character === ')' || character === '\\') return `\\${character}`;
    return code >= 0x20 && code < 0x7f ? character : `\\${code.toString(8).padStart(3, '0')}`;
  });
  return `(${escaped.join('')})`;
}

/** The words' font, size and colour as the file's `DA` says them. */
export const defaultAppearanceOf = (size: number, colour: string): string =>
  `/${APPEARANCE_FONT} ${num(size)} Tf ${rgbOf(colour)} rg`;

/** A glyph id as a two-byte `Identity-H` code. */
const code = (glyph: number): string => `<${glyph.toString(16).toUpperCase().padStart(4, '0')}>`;

/**
 * A shaped run as `TJ`: each glyph moved by its offset and then on by its shaped advance where that is not the font's
 * own; a glyph raised or lowered (a mark above a letter) set apart with its rise.
 */
function shownRun(run: ShapedRun, size: number, setter: RunSetter): string[] {
  const shown: string[] = [];
  let items: string[] = [];
  let pending = 0;
  const flush = () => {
    if (items.length > 0) shown.push(`[${items.join(' ')}] TJ`);
    items = [];
  };
  const move = (thousandths: number) => {
    pending += thousandths;
  };
  const put = (glyph: number) => {
    // A TJ number moves back by its thousandths: the shown move is its negation.
    if (num(pending) !== '0') items.push(num(-pending));
    items.push(code(glyph));
    pending = 0;
  };
  for (const glyph of run.glyphs) {
    const own = setter.advance(run.face, glyph.glyph);
    move(glyph.xOffset);
    if (glyph.yOffset !== 0) {
      flush();
      if (num(pending) !== '0') shown.push(`[${num(-pending)}] TJ`);
      pending = 0;
      shown.push(`${num((glyph.yOffset * size) / 1000)} Ts`, `[${code(glyph.glyph)}] TJ`, '0 Ts');
    } else put(glyph.glyph);
    move(glyph.advance - own - glyph.xOffset);
  }
  if (num(pending) !== '0') items.push(num(-pending));
  flush();
  return shown;
}

/**
 * A line in the mark faces: its runs in visual order (UAX 9), each shaped in its own direction, set from the line's
 * own side; narrowed to its measured width where shaping set it wider (marks.md "Laying out").
 */
function facedLine(
  line: WordLine & FacedLine,
  setter: RunSetter,
  fontOf: (run: ShapedRun) => string,
): string[] {
  const runs = MarkFaces.runs(line).flatMap(setter.split);
  const ordered = inVisualOrder(runs, setter.levels(line.text, line.rtl)).map(
    ({ face, text, level }) => setter.shape({ face, text }, level % 2 === 1),
  );
  const shaped = (ordered.reduce((sum, run) => sum + run.width, 0) * line.size) / 1000;
  const scale = shaped > line.width ? line.width / shaped : 1;
  const x = line.rtl ? line.x + line.width - shaped * scale : line.x;
  const out = [`${num(scale * 100)} Tz 1 0 0 1 ${num(x)} ${num(line.y)} Tm`];
  for (const run of ordered)
    out.push(`/${fontOf(run)} ${num(line.size)} Tf`, ...shownRun(run, line.size, setter));
  return out;
}

const path = (points: MarkDrawing['fills'][number]): string =>
  points.map(({ x, y }, at) => `${num(x)} ${num(y)} ${at === 0 ? 'm' : 'l'}`).join(' ');

/**
 * The box an appearance is drawn in: everything it draws and the box its words are set in, grown by its widest line.
 * Read back too, to find a mark's own box within the `Rect` a bake wrote (marks.md "Changing a mark").
 */
export function appearanceBox(
  { fills, strokes }: Pick<MarkDrawing, 'fills' | 'strokes'>,
  wordsBox: Box | null,
): Box {
  const box = wordsBox
    ? [
        { x: wordsBox[0], y: wordsBox[1] },
        { x: wordsBox[2], y: wordsBox[3] },
      ]
    : [];
  const all = [...fills.flat(), ...strokes.flatMap((stroke) => stroke.points), ...box];
  const grow = Math.max(0, ...strokes.map((stroke) => stroke.width));
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  return [
    Math.min(...xs) - grow,
    Math.min(...ys) - grow,
    Math.max(...xs) + grow,
    Math.max(...ys) + grow,
  ];
}

export function appearanceOf(
  { fills, strokes, fill }: MarkDrawing,
  look: { readonly colour: string; readonly opacity: number },
  words: MarkWords | null = null,
  setter: RunSetter | null = null,
): Appearance {
  const colour = rgbOf(look.colour);
  const opacity = look.opacity < 1 ? look.opacity : null;
  const lines = ['q'];
  if (opacity !== null) lines.push(`/${APPEARANCE_STATE} gs`);
  if (fill) lines.push(`${rgbOf(fill.colour)} rg`, `${path(fill.points)} h f`);
  if (fills.length > 0) lines.push(`${colour} rg`, ...fills.map((points) => `${path(points)} h f`));
  if (strokes.length > 0) lines.push(`${colour} RG`);
  // A line style's pattern where a stroke has one, and solid again for a stroke after it that has none.
  let dashed = false;
  for (const stroke of strokes) {
    const ends = stroke.round ? 1 : 0;
    const dash = stroke.dash ?? [];
    const pattern = dash.length > 0 || dashed ? ` [${dash.map((n) => num(n)).join(' ')}] 0 d` : '';
    dashed = dash.length > 0;
    lines.push(`${num(stroke.width)} w ${ends} J ${ends} j${pattern}`);
    lines.push(`${path(stroke.points)}${stroke.closed ? ' h' : ''} S`);
  }
  const set = words?.lines.filter((line) => line.text !== '') ?? [];
  const fonts: AppearanceFont[] = [];
  const faces: { name: string; face: string; glyphs: ShapedGlyph[] }[] = [];
  if (set.length > 0 && words?.faces === 'embedded') {
    if (!setter) throw new NoRunSetter('words in the mark faces need a typesetter');
    const fontOf = (run: ShapedRun): string => {
      let face = faces.find((each) => each.face === run.face);
      if (!face) {
        face = { name: `${APPEARANCE_FACE}${faces.length}`, face: run.face, glyphs: [] };
        faces.push(face);
      }
      face.glyphs.push(...run.glyphs);
      return face.name;
    };
    lines.push('BT', `${colour} rg`);
    for (const line of set)
      lines.push(...facedLine({ ...line, region: words.region, font: words.font }, setter, fontOf));
    lines.push('ET');
  } else if (set.length > 0) {
    lines.push('BT');
    let face = '';
    for (const line of set) {
      const font = line.bold ? APPEARANCE_BOLD_FONT : APPEARANCE_FONT;
      if (!fonts.includes(font)) fonts.push(font);
      // The font and size where they change; the colour with the first.
      const next = `/${font} ${num(line.size)} Tf`;
      if (next !== face) lines.push(face === '' ? `${next} ${colour} rg` : next);
      face = next;
      lines.push(`1 0 0 1 ${num(line.x)} ${num(line.y)} Tm ${winAnsiString(line.text)} Tj`);
    }
    lines.push('ET');
  }
  lines.push('Q');
  return {
    content: lines.join('\n'),
    box: appearanceBox({ fills, strokes }, words?.box ?? null),
    opacity,
    fonts,
    faces,
  };
}
