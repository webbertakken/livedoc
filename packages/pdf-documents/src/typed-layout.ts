// How a Text's or a Callout's words sit in their box (docs/specs/035-pdf-documents/marks.md "Making a mark": The words
// wrap; Its writing direction; Text's and Callout's first look; A Callout's line): lines broken greedily at the box's
// width, measured in the faces that set them (Helvetica, or the mark faces: "Words in every script"), each
// paragraph set from its own side. Pure, so the surface's overlay, the canvas
// pictures and the appearance a bake writes set one mark's words the same way.
import type { PagePoint } from './engine-contract';
import { Helvetica } from './helvetica';
import { MarkFaces, type MarkFaceSet } from './mark-faces';
import { PDF_CALLOUT_KNEE_PT, PDF_TEXT_PADDING_PT } from './limits';
import type { Box, CalloutLine, TypedMark } from './mark';

/** (default) Lines are this many times the size apart (marks.md "Text's and Callout's first look"). */
export const TYPED_LINE_HEIGHT = 1.2;
/** A line's baseline below its top, in sizes: Helvetica's letters centred in the line's height. */
const BASELINE =
  (TYPED_LINE_HEIGHT - (Helvetica.ascent + Helvetica.descent) / 1000) / 2 + Helvetica.ascent / 1000;

export type TypedLine = {
  readonly text: string;
  /** How wide it is set, in points. */
  readonly width: number;
  /** Whether its paragraph reads right to left. */
  readonly rtl: boolean;
};

/** A line placed on the page: its baseline's start, the left end of the line however it reads. */
export type PlacedLine = TypedLine & { readonly x: number; readonly y: number };

// A paragraph reads right to left where its first letter with a direction does: Hebrew, Arabic, Syriac, Thaana, N'Ko
// and their presentation forms.
const LETTER = /\p{L}/u;
const RIGHT_TO_LEFT = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;
const readsRightToLeft = (paragraph: string): boolean => {
  const first = Array.from(paragraph).find((character) => LETTER.test(character));
  return first !== undefined && RIGHT_TO_LEFT.test(first);
};

/** How wide words are set at a size in a mark's faces, in points. */
const widthOf = (text: string, size: number, faces: MarkFaceSet): number =>
  (faces === 'helvetica'
    ? Array.from(text).reduce((sum, character) => sum + Helvetica.width(character.codePointAt(0)!), 0)
    : MarkFaces.width({ text, bold: false })) *
  (size / 1000);

/** A mark's words as they are set: composed (Unicode NFC), each paragraph apart. */
const paragraphsOf = (words: string): string[] =>
  words.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');

/** The faces a mark's words are set in. */
const facesOf = (paragraphs: readonly string[]): MarkFaceSet =>
  MarkFaces.setOf(paragraphs.map((text) => ({ text, bold: false })));

/** A word wider than `room` broken where it meets the side: each piece as many characters as fit, one at the least. */
function pieces(word: string, size: number, room: number, faces: MarkFaceSet): string[] {
  const all: string[] = [];
  let piece = '';
  for (const character of Array.from(word)) {
    if (piece !== '' && widthOf(piece + character, size, faces) > room) {
      all.push(piece);
      piece = '';
    }
    piece += character;
  }
  return [...all, piece];
}

/** A paragraph's lines, broken greedily at the spaces, a word too wide broken itself. */
function wrap(paragraph: string, size: number, room: number, faces: MarkFaceSet): string[] {
  // A paragraph has a word at the least, if only an empty one.
  const [first, ...rest] = paragraph.split(' ');
  const lines = pieces(first!, size, room, faces);
  for (const word of rest) {
    const joined = `${lines.at(-1)!} ${word}`;
    if (widthOf(joined, size, faces) <= room) lines[lines.length - 1] = joined;
    else lines.push(...pieces(word, size, room, faces));
  }
  return lines;
}

export const TypedLayout = {
  /** The lines words make in a box `width` points wide, at `size` points, each paragraph's direction its own. */
  lines: (words: string, size: number, width: number): readonly TypedLine[] => {
    const room = width - 2 * PDF_TEXT_PADDING_PT;
    const paragraphs = paragraphsOf(words);
    const faces = facesOf(paragraphs);
    return paragraphs.flatMap((paragraph) => {
      const rtl = readsRightToLeft(paragraph);
      return wrap(paragraph, size, room, faces).map((text) => ({
        text,
        width: widthOf(text, size, faces),
        rtl,
      }));
    });
  },

  /** The faces a mark's words are set in. */
  faces: (words: string): MarkFaceSet => facesOf(paragraphsOf(words)),

  /** How high a box holds so many lines, in points. */
  height: (lines: number, size: number): number =>
    2 * PDF_TEXT_PADDING_PT + lines * TYPED_LINE_HEIGHT * size,

  /** How wide a box holds its widest line, in points. */
  width: (lines: readonly TypedLine[]): number =>
    2 * PDF_TEXT_PADDING_PT + Math.max(0, ...lines.map((line) => line.width)),

  /** A mark's lines on the page, from the top of its box down, each against its own side. */
  place: ({
    rect: [left, , right, top],
    words,
    size,
  }: Pick<TypedMark, 'rect' | 'words' | 'size'>) =>
    TypedLayout.lines(words, size, right - left).map((line, at): PlacedLine => ({
      ...line,
      x: line.rtl ? right - PDF_TEXT_PADDING_PT - line.width : left + PDF_TEXT_PADDING_PT,
      y: top - PDF_TEXT_PADDING_PT - (at * TYPED_LINE_HEIGHT + BASELINE) * size,
    })),

  /** A Callout's line from what is meant to the middle of the box's side facing it, through a knee out from that side. */
  calloutLine: (tip: PagePoint, [left, bottom, right, top]: Box): CalloutLine => {
    const fromLeft = tip.x < (left + right) / 2;
    const side = fromLeft ? left : right;
    const middle = (bottom + top) / 2;
    const knee = fromLeft ? side - PDF_CALLOUT_KNEE_PT : side + PDF_CALLOUT_KNEE_PT;
    return [tip.x, tip.y, knee, middle, side, middle];
  },
} as const;
