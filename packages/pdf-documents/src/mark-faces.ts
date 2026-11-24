// The faces a mark's words are set in (docs/specs/035-pdf-documents/marks.md "Words in every script"): Helvetica where
// it writes every character of them, else the mark faces, each character in the first that has it; Chinese, Japanese
// and Korean in the one region the mark's words show. How wide each is set comes from the generated tables, so the
// surface and the bake measure alike with no font loaded. Pure.
import { Helvetica } from './helvetica';
import { MARK_FACE_DATA } from './mark-face-data';
import { MARK_FACE_REGIONS_BEFORE, type MarkFaceRegion } from './mark-face-families';
import { MARK_FACE_REGION_DATA } from './mark-face-region-data';

/** The faces a mark is set in: the standard's Helvetica, or the mark faces. */
export type MarkFaceSet = 'helvetica' | 'noto';

/** A stretch of a line set in one mark face. */
export type MarkRun = { readonly face: string; readonly text: string };

/**
 * A line of a mark's words, as far as its faces go: its text, whether it is bold, and the region its mark's Chinese,
 * Japanese or Korean is set in (Simplified Chinese where none is given).
 */
export type FacedLine = {
  readonly text: string;
  readonly bold: boolean;
  readonly region?: MarkFaceRegion;
};

type Weight = 400 | 700;
/** A region's order: each weight's faces in the order a character is looked for, and the first that has each. */
type Order = {
  readonly faces: Readonly<Record<Weight, readonly string[]>>;
  readonly first: Readonly<Record<Weight, ReadonlyMap<number, string>>>;
};

/** Each face's advances by code point, and its missing glyph's advance: a region's added when it is first set. */
const advances = new Map<string, ReadonlyMap<number, number>>();
const missing = new Map<string, number>();
const orders = new Map<MarkFaceRegion, Order>();

/** The subset faces read into maps, once, the first time a mark needs them. */
function subsetFaces(): void {
  if (advances.size > 0) return;
  for (const face of MARK_FACE_DATA) {
    const own = new Map<number, number>();
    for (const [start, ...run] of face.runs)
      run.forEach((advance, at) => own.set(start! + at, advance));
    advances.set(face.id, own);
    missing.set(face.id, face.missing);
  }
}

/** A region's face read into a map: its ranges walked, each character given the advance its run says. */
function regionFace(region: MarkFaceRegion): string {
  const face = MARK_FACE_REGION_DATA.find((each) => each.region === region)!;
  const codes: number[] = [];
  let end = 0;
  for (let at = 0; at < face.ranges.length; at += 2) {
    const first = end + face.ranges[at]!;
    end = first + face.ranges[at + 1]!;
    for (let code = first; code < end; code += 1) codes.push(code);
  }
  const own = new Map<number, number>();
  let next = 0;
  for (let at = 0; at < face.advances.length; at += 2)
    for (let n = 0; n < face.advances[at]!; n += 1) own.set(codes[next++]!, face.advances[at + 1]!);
  advances.set(face.id, own);
  missing.set(face.id, face.missing);
  return face.id;
}

/** The order of a region: the subset faces, its region's face just before the symbols. */
function orderOf(region: MarkFaceRegion): Order {
  const known = orders.get(region);
  if (known) return known;
  subsetFaces();
  const cjk = regionFace(region);
  const faces: Record<Weight, string[]> = { 400: [], 700: [] };
  for (const face of MARK_FACE_DATA) {
    if (face.family === MARK_FACE_REGIONS_BEFORE && !faces[400].includes(cjk)) faces[400].push(cjk);
    faces[face.weight].push(face.id);
  }
  const first: Record<Weight, Map<number, string>> = { 400: new Map(), 700: new Map() };
  for (const weight of [400, 700] as const)
    for (const face of faces[weight])
      for (const code of advances.get(face)!.keys())
        if (!first[weight].has(code)) first[weight].set(code, face);
  const order = { faces, first };
  orders.set(region, order);
  return order;
}

/** A character of no script of its own: a space, punctuation, a digit, a combining mark. */
const SHARED = /[\p{Script=Common}\p{Script=Inherited}]/u;

/** The face a character is set in: bold where a bold face has it, else regular; none has it, the first regular. */
function faceOf({ first, faces }: Order, code: number, bold: boolean): string {
  return (bold ? first[700].get(code) : undefined) ?? first[400].get(code) ?? faces[400][0]!;
}

/** Whether a face has every character of a cluster. */
const hasAll = (face: string, codes: readonly number[]): boolean => {
  const own = advances.get(face)!;
  return codes.every((code) => own.has(code));
};

/** The first face that has every character of a cluster, bold first where the line is bold; null where none has. */
function faceOfCluster({ faces }: Order, codes: readonly number[], bold: boolean): string | null {
  const weights: readonly Weight[] = bold ? [700, 400] : [400];
  for (const weight of weights)
    for (const face of faces[weight]) if (hasAll(face, codes)) return face;
  return null;
}

/** Kana, which shows words to be Japanese; Hangul, which shows them Korean. */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

/** A line's clusters: the characters read as one (a letter and its accents, an emoji and its modifiers). */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const clustersOf = (text: string): string[] =>
  Array.from(segmenter.segment(text), ({ segment }) => segment);

export const MarkFaces = {
  /** The faces a mark's lines are set in: Helvetica where it writes every character of each, else the mark faces. */
  setOf: (lines: readonly FacedLine[]): MarkFaceSet =>
    lines.every(({ text }) =>
      Array.from(text).every((character) => Helvetica.writes(character.codePointAt(0)!)),
    )
      ? 'helvetica'
      : 'noto',

  /** The region a mark's Chinese, Japanese or Korean is set in: kana Japanese, else Hangul Korean, else Chinese. */
  regionOf: (lines: readonly Pick<FacedLine, 'text'>[]): MarkFaceRegion =>
    lines.some(({ text }) => KANA.test(text))
      ? 'jp'
      : lines.some(({ text }) => HANGUL.test(text))
        ? 'kr'
        : 'sc',

  /**
   * A line cut into runs of one mark face each. A cluster (a letter and its accents, an emoji and its modifiers) is
   * set whole in the first face that has all of it, so it is shaped as one; one of no script of its own (a space, a
   * digit) stays in the face before it where that face has it, so a space does not change the font. A cluster no
   * face has whole is set character by character.
   */
  runs: ({ text, bold, region = 'sc' }: FacedLine): readonly MarkRun[] => {
    const order = orderOf(region);
    const runs: { face: string; text: string }[] = [];
    const put = (face: string, part: string) => {
      const before = runs.at(-1);
      if (before?.face === face) before.text += part;
      else runs.push({ face, text: part });
    };
    for (const cluster of clustersOf(text)) {
      const characters = Array.from(cluster);
      const codes = characters.map((character) => character.codePointAt(0)!);
      const before = runs.at(-1);
      const shared = characters.every((character) => SHARED.test(character));
      const face =
        before && shared && hasAll(before.face, codes)
          ? before.face
          : codes.length === 1
            ? faceOf(order, codes[0]!, bold)
            : faceOfCluster(order, codes, bold);
      if (face !== null) put(face, cluster);
      else
        for (const character of characters) {
          const code = character.codePointAt(0)!;
          const last = runs.at(-1);
          put(
            last && SHARED.test(character) && hasAll(last.face, [code])
              ? last.face
              : faceOf(order, code, bold),
            character,
          );
        }
    }
    return runs;
  },

  /** How wide a line is set in the mark faces, in thousandths of its size; a character none has, as the missing box. */
  width: (line: FacedLine): number =>
    MarkFaces.runs(line).reduce(
      (sum, { face, text }) =>
        Array.from(text).reduce(
          (width, character) =>
            width + (advances.get(face)!.get(character.codePointAt(0)!) ?? missing.get(face)!),
          sum,
        ),
      0,
    ),
} as const;
