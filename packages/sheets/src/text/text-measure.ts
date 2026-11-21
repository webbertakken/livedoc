// How wide a cell's text is, with no DOM to ask (docs/specs/029-sheets/sheet.md "Row height"): each character's
// advance from a table of its font's own (font-advances.ts), so every browser, the api, an agent's write and an
// export measure the same line. A character outside the table is measured by its kind (D91). Text with no font of
// its own is drawn in the device's own font, which no table holds: it is measured in the system face, each character
// as wide as the widest of the fonts a system names (D92), so a line breaks early rather than run past its cell. Pure.
import { ADVANCE_FIRST, FONT_ADVANCES, SYSTEM_ADVANCES, type FontAdvances } from './font-advances';

// A cell's text with no font size of its own, in px (sheet.md "The grid"), and a line's height in font sizes.
export const TEXT_BASE_PX = 13;
const LINE_HEIGHT_EM = 1.3;
const ADVANCE_LAST = 0x7e;
// The key the system face's tables are kept under: no font's id.
const SYSTEM_FACE = '';

// The fonts with a table of their own, by id: the editor's fonts, kept in step with its catalogue by a test.
export const MEASURED_FONTS: readonly string[] = Object.keys(FONT_ADVANCES);

// What a text is measured in: a font by its id (the editor's fonts) and whether it is bold. No font, or one the
// editor no longer offers, is the system face.
export type TextFace = { font?: string | undefined; bold?: boolean | undefined };

export function fontPx(fontSize: number | undefined): number {
  return fontSize ? Math.round((fontSize * 4) / 3) : TEXT_BASE_PX;
}

export function lineHeightPx(px: number): number {
  return Math.round(px * LINE_HEIGHT_EM);
}

// A face's advances and its average letters, lower and upper case, for the letters its table does not hold.
type Table = { units: readonly number[]; lower: number; upper: number };
const TABLES = new Map<string, Table>();

function mean(units: readonly number[], from: string, to: string): number {
  let sum = 0;
  for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code++)
    sum += units[code - ADVANCE_FIRST]!;
  return sum / (to.charCodeAt(0) - from.charCodeAt(0) + 1);
}

function tableOf(face: TextFace): Table {
  const known: FontAdvances | undefined =
    face.font && Object.hasOwn(FONT_ADVANCES, face.font) ? FONT_ADVANCES[face.font] : undefined;
  const font = known ? face.font! : SYSTEM_FACE;
  const key = face.bold ? `${font}*` : font;
  let table = TABLES.get(key);
  if (!table) {
    const advances = known ?? SYSTEM_ADVANCES;
    const units = face.bold ? advances.bold : advances.regular;
    table = { units, lower: mean(units, 'a', 'z'), upper: mean(units, 'A', 'Z') };
    TABLES.set(key, table);
  }
  return table;
}

// How a character outside the table is measured: as an ASCII character (its code), as a fixed share of an em, or as
// the face's average letter. Worked out once per character.
type Kind = { as: number } | { units: number } | { letter: 'lower' | 'upper' };
const KINDS = new Map<number, Kind>();
const NOTHING: Kind = { units: 0 };
const FULL_EM: Kind = { units: 1000 };
const EMOJI: Kind = { units: 1250 };

// Punctuation and symbols people type often, each measured as the ASCII it is closest to.
const STAND_INS: Readonly<Record<string, string>> = {
  '\u00a0': ' ',
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u2010': '-',
  '\u2011': '-',
  '\u2013': '+',
  '\u2212': '+',
  '\u2022': 'o',
  '\u00b7': '.',
  '\u00d7': '+',
  '\u00f7': '+',
  '\u00b1': '+',
  '\u00b0': '*',
  '€': '0',
  '£': '0',
  '¥': '0',
  '¢': '0',
  '₹': '0',
};

const between = (code: number, from: number, to: number) => code >= from && code <= to;

// Marks that sit on the character before them, and characters that draw nothing: no width of their own.
export function isMark(code: number): boolean {
  return (
    between(code, 0x0300, 0x036f) ||
    between(code, 0x200b, 0x200f) ||
    between(code, 0x20d0, 0x20ff) ||
    between(code, 0xfe00, 0xfe0f) ||
    code === 0x2060 ||
    code === 0xfeff
  );
}

// Characters drawn a full em wide, between any two of which a line may break.
export function isWide(code: number): boolean {
  return (
    between(code, 0x1100, 0x115f) ||
    between(code, 0x2e80, 0xa4cf) ||
    between(code, 0xac00, 0xd7a3) ||
    between(code, 0xf900, 0xfaff) ||
    between(code, 0xfe30, 0xfe4f) ||
    between(code, 0xff00, 0xff60) ||
    between(code, 0xffe0, 0xffe6)
  );
}

function kindOf(code: number): Kind {
  if (code < ADVANCE_FIRST || between(code, 0x7f, 0x9f) || isMark(code)) return NOTHING;
  if (isWide(code)) return FULL_EM;
  // Pictographs: arrows, technical and miscellaneous symbols, dingbats, and everything past the basic plane.
  if (
    between(code, 0x2190, 0x21ff) ||
    between(code, 0x2300, 0x27bf) ||
    (code >= 0x2b00 && code <= 0x2bff)
  )
    return EMOJI;
  if (code > 0xffff) return EMOJI;
  if (code === 0x2014) return FULL_EM;
  const ch = String.fromCharCode(code);
  const standIn = STAND_INS[ch];
  if (standIn) return { as: standIn.charCodeAt(0) };
  const base = ch.normalize('NFD').charCodeAt(0);
  if (between(base, ADVANCE_FIRST, ADVANCE_LAST)) return { as: base };
  return { letter: ch.toLowerCase() === ch ? 'lower' : 'upper' };
}

const TAB_SPACES = 8;
const ELLIPSIS = 0x2026;

// The advance of the character at `code` (a whole code point), in thousandths of an em.
export function advanceUnits(code: number, table: Table): number {
  if (between(code, ADVANCE_FIRST, ADVANCE_LAST)) return table.units[code - ADVANCE_FIRST]!;
  if (code === 0x09) return table.units[0]! * TAB_SPACES;
  if (code === ELLIPSIS) return table.units['.'.charCodeAt(0) - ADVANCE_FIRST]! * 3;
  let kind = KINDS.get(code);
  if (!kind) KINDS.set(code, (kind = kindOf(code)));
  if ('units' in kind) return kind.units;
  if ('as' in kind) return table.units[kind.as - ADVANCE_FIRST]!;
  return kind.letter === 'lower' ? table.lower : table.upper;
}

// A face's table, for a caller measuring character by character (wrap-lines.ts).
export function faceTable(face: TextFace): Table {
  return tableOf(face);
}

// The width of `text` on one line, in px.
export function textWidth(text: string, px: number, face: TextFace = {}): number {
  const table = tableOf(face);
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++;
    units += advanceUnits(code, table);
  }
  return (units * px) / 1000;
}
