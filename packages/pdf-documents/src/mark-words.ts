// The words a mark sets on its page (docs/specs/035-pdf-documents/marks.md "Making a mark": The words wrap; "Stamps":
// LiveDoc's style): a Text's and a Callout's as TypedLayout places them, a stamp's as StampLayout does, each line with
// its size and face, and the box they are set in. One answer, so the surface's overlay, the canvas pictures and the
// appearance a bake writes set every mark's words the same way.
import { Mark, type Box } from './mark';
import { StampLayout, type StampLine } from './stamp-layout';
import { TypedLayout } from './typed-layout';

/** A line of a mark's words on the page: where its baseline starts, its size and whether it is bold. */
export type WordLine = StampLine;

export type MarkWords = {
  readonly lines: readonly WordLine[];
  readonly box: Box;
};

export const MarkWords = {
  /** A mark's words placed on its page; null for a kind that sets none. */
  of: (mark: Mark): MarkWords | null => {
    if (mark.kind === 'stamp') return { lines: StampLayout.place(mark), box: mark.rect };
    if (!Mark.isTyped(mark)) return null;
    return {
      lines: TypedLayout.place(mark).map((line) => ({ ...line, size: mark.size, bold: false })),
      box: mark.rect,
    };
  },
} as const;
