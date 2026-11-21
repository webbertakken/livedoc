// Footnotes (docs/specs/034-text-documents/page-layout.md "Footnotes"): numbered 1, 2, 3 through the body in the order
// of their marks, those in table cells included; headers' and footers' never.
import type { Block, Note } from './blocks';
import { Blocks } from './tables';

export const Notes = {
  /** The body's notes in the order of their marks. */
  all: (body: readonly Block[]): Note[] =>
    Blocks.paragraphs(body).flatMap((p) => p.inlines.filter((i): i is Note => i.type === 'note')),
  /** Each of the body's notes with its number, from 1. */
  numbers: (body: readonly Block[]): Map<Note, number> =>
    new Map(Notes.all(body).map((note, i) => [note, i + 1])),
} as const;
