// The faces a mark's words are set in (docs/specs/035-pdf-documents/marks.md "Words in every script"): Helvetica where
// it writes every character of them, else the mark faces, each character in the first that has it. How wide each is
// set comes from the generated table, so the surface and the bake measure alike with no font loaded. Pure.
import { Helvetica } from './helvetica';
import { MARK_FACE_DATA } from './mark-face-data';

/** The faces a mark is set in: the standard's Helvetica, or the mark faces. */
export type MarkFaceSet = 'helvetica' | 'noto';

/** A stretch of a line set in one mark face. */
export type MarkRun = { readonly face: string; readonly text: string };

/** A line of a mark's words, as far as its faces go: its text and whether it is bold. */
export type FacedLine = { readonly text: string; readonly bold: boolean };

type Weight = 400 | 700;
type Faces = {
  /** Each face's advances by code point. */
  readonly advances: ReadonlyMap<string, ReadonlyMap<number, number>>;
  /** Each weight's faces in the order a character is looked for. */
  readonly order: Readonly<Record<Weight, readonly string[]>>;
  /** Each weight's face for every character one of its faces has: the first that has it. */
  readonly first: Readonly<Record<Weight, ReadonlyMap<number, string>>>;
  readonly missing: ReadonlyMap<string, number>;
};

let faces: Faces | null = null;

/** The table read into maps, once, the first time a mark needs it. */
function table(): Faces {
  if (faces) return faces;
  const advances = new Map<string, Map<number, number>>();
  const order: Record<Weight, string[]> = { 400: [], 700: [] };
  const first: Record<Weight, Map<number, string>> = { 400: new Map(), 700: new Map() };
  const missing = new Map<string, number>();
  for (const face of MARK_FACE_DATA) {
    const own = new Map<number, number>();
    for (const [start, ...run] of face.runs)
      run.forEach((advance, at) => own.set(start! + at, advance));
    advances.set(face.id, own);
    missing.set(face.id, face.missing);
    order[face.weight].push(face.id);
    for (const code of own.keys())
      if (!first[face.weight].has(code)) first[face.weight].set(code, face.id);
  }
  faces = { advances, order, first, missing };
  return faces;
}

/** A character of no script of its own: a space, punctuation, a digit, a combining mark. */
const SHARED = /[\p{Script=Common}\p{Script=Inherited}]/u;

/** The face a character is set in: bold where a bold face has it, else regular; none has it, the first regular. */
function faceOf(code: number, bold: boolean): string {
  const { first, order } = table();
  return (bold ? first[700].get(code) : undefined) ?? first[400].get(code) ?? order[400][0]!;
}

/** Whether a face has every character of a cluster. */
const hasAll = (face: string, codes: readonly number[]): boolean => {
  const own = table().advances.get(face)!;
  return codes.every((code) => own.has(code));
};

/** The first face that has every character of a cluster, bold first where the line is bold; null where none has. */
function faceOfCluster(codes: readonly number[], bold: boolean): string | null {
  const { order } = table();
  const weights: readonly Weight[] = bold ? [700, 400] : [400];
  for (const weight of weights)
    for (const face of order[weight]) if (hasAll(face, codes)) return face;
  return null;
}

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

  /**
   * A line cut into runs of one mark face each. A cluster (a letter and its accents, an emoji and its modifiers) is
   * set whole in the first face that has all of it, so it is shaped as one; one of no script of its own (a space, a
   * digit) stays in the face before it where that face has it, so a space does not change the font. A cluster no
   * face has whole is set character by character.
   */
  runs: ({ text, bold }: FacedLine): readonly MarkRun[] => {
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
            ? faceOf(codes[0]!, bold)
            : faceOfCluster(codes, bold);
      if (face !== null) put(face, cluster);
      else
        for (const character of characters) {
          const code = character.codePointAt(0)!;
          const last = runs.at(-1);
          put(
            last && SHARED.test(character) && hasAll(last.face, [code])
              ? last.face
              : faceOf(code, bold),
            character,
          );
        }
    }
    return runs;
  },

  /** How wide a line is set in the mark faces, in thousandths of its size; a character none has, as the missing box. */
  width: (line: FacedLine): number => {
    const { advances, missing } = table();
    return MarkFaces.runs(line).reduce(
      (sum, { face, text }) =>
        Array.from(text).reduce(
          (width, character) =>
            width + (advances.get(face)!.get(character.codePointAt(0)!) ?? missing.get(face)!),
          sum,
        ),
      0,
    );
  },
} as const;
