// Paragraph numbers (docs/specs/034-text-documents/agents-and-sync.md "Reading"): a paragraph has no id, so agents
// name one as `¶<n>`, counted from 1 over a document tab's body in reading order, a table's paragraphs row by row (a
// table in a cell within it), as the text view prints them. A table of contents' entries are drawn, not written, and
// are not counted.
import type { Block, Paragraph } from './blocks';
import { Blocks } from './tables';

export const PARAGRAPH_REF_MARK = '¶';

export const ParagraphRefs = {
  /** A document tab's paragraphs in number order: the first is ¶1. */
  of: (body: readonly Block[]): Paragraph[] => Blocks.paragraphs(body),
  /** Each paragraph's number. */
  numbers: (body: readonly Block[]): Map<Paragraph, number> =>
    new Map(Blocks.paragraphs(body).map((p, i) => [p, i + 1])),
  /** `¶12`. */
  text: (n: number): string => `${PARAGRAPH_REF_MARK}${n}`,
} as const;
