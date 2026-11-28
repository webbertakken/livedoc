// The faces laid-out pages are set in (docs/specs/035-pdf-documents/files-print-and-sync.md "One writer"; plan 0019
// blueprint "PR 14f1"): a page's own fonts, each a list of WOFF files (a family's subsets for one weight and style),
// read once; each character set in the first of its face's files that has it whole, and every character none has in
// the mark faces, in their order (marks.md "Words in every script"). A face whose files do not load is set in the
// mark faces alone.
import { MarkFaces, type MarkRun } from '../mark-faces';
import { Sfnt } from './sfnt';
import type { MarkFaceSource } from './typesetter';
import { woffTables } from './woff';

/** A font the pages name: its id, and its files within the Fontsource packages (`lora/files/…woff`), in order. */
export type LaidOutFace = {
  readonly id: string;
  readonly files: readonly string[];
  /** Bold or heavier: the mark faces it falls back to are their bold. */
  readonly bold?: boolean;
};

/** A face's file, read: the id the typesetter knows it by, its file, and the characters it holds. */
type FacePart = { readonly id: string; readonly file: string; readonly holds: ReadonlySet<number> };

/** The faces read: each face's parts that loaded, in order. */
export type ReadFaces = {
  readonly parts: ReadonlyMap<string, readonly FacePart[]>;
  readonly bold: ReadonlyMap<string, boolean>;
  /** The typesetter's ids of every part, with its file. */
  readonly files: ReadonlyMap<string, string>;
  /** How many files did not load. */
  readonly failed: number;
};

/** The typesetter's id of a face's nth file. */
export const partId = (face: string, at: number): string => `laid-out:${face}:${at}`;

/** Reads each face's files; one that does not load or read is left out and counted. */
export async function readFaces(
  faces: readonly LaidOutFace[],
  source: MarkFaceSource,
): Promise<ReadFaces> {
  const parts = new Map<string, FacePart[]>();
  const bold = new Map<string, boolean>();
  const files = new Map<string, string>();
  let failed = 0;
  for (const face of faces) {
    bold.set(face.id, face.bold === true);
    const read = await Promise.all(
      face.files.map(async (file, at): Promise<FacePart | null> => {
        try {
          const tables = await woffTables(await source(file));
          return { id: partId(face.id, at), file, holds: new Set(Sfnt.characters(tables).keys()) };
        } catch {
          return null;
        }
      }),
    );
    failed += read.filter((part) => part === null).length;
    const loaded = read.filter((part): part is FacePart => part !== null);
    parts.set(face.id, loaded);
    for (const part of loaded) files.set(part.id, part.file);
  }
  return { parts, bold, files, failed };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Characters of no script of their own: they stay in the face before them where it has them. */
const SHARED = /^[\s\p{P}\p{N}\p{S}]+$/u;

/**
 * Text cut into runs of one face each: a grapheme in the first of the face's parts that holds all of it, a stretch no
 * part holds in the mark faces; a shared character in the part before it where that part holds it.
 */
export function runsIn(text: string, face: string, faces: ReadFaces): MarkRun[] {
  const parts = faces.parts.get(face) ?? [];
  const bold = faces.bold.get(face) ?? false;
  const runs: { face: string; text: string }[] = [];
  let stretch = '';
  const put = (id: string, part: string) => {
    const before = runs.at(-1);
    if (before?.face === id) before.text += part;
    else runs.push({ face: id, text: part });
  };
  const flush = () => {
    if (stretch === '') return;
    for (const run of MarkFaces.runs({ text: stretch, bold })) put(run.face, run.text);
    stretch = '';
  };
  for (const { segment } of graphemes.segment(text)) {
    const codes = Array.from(segment, (character) => character.codePointAt(0)!);
    const holds = (part: FacePart) => codes.every((code) => part.holds.has(code));
    const before = runs.at(-1);
    const beforePart = stretch === '' ? parts.find((part) => part.id === before?.face) : undefined;
    const part =
      beforePart && SHARED.test(segment) && holds(beforePart) ? beforePart : parts.find(holds);
    if (!part) {
      stretch += segment;
      continue;
    }
    flush();
    put(part.id, segment);
  }
  flush();
  return runs;
}
