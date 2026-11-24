// The words a mark sets on its page (docs/specs/035-pdf-documents/marks.md "Making a mark": The words wrap; "Stamps":
// LiveDoc's style; "Words in every script"): a Text's and a Callout's as TypedLayout places them, a stamp's as
// StampLayout does, each line with its size and face, the box they are set in, and the faces the mark is set in. One
// answer, so the surface's overlay, the canvas pictures and the appearance a bake writes set every mark's words alike.
import { Mark, type Box } from './mark';
import type { MarkFaceRegion } from './mark-face-families';
import type { MarkFaceSet } from './mark-faces';
import { StampLayout, type StampLine } from './stamp-layout';
import { TypedLayout } from './typed-layout';

/** A line of a mark's words on the page: where its baseline starts, its size and whether it is bold. */
export type WordLine = StampLine;

export type MarkWords = {
  readonly lines: readonly WordLine[];
  readonly box: Box;
  /** Helvetica, or the mark faces, for every line of the mark alike. */
  readonly faces: MarkFaceSet;
  /** The region its Chinese, Japanese or Korean is set in, for every line alike. */
  readonly region: MarkFaceRegion;
};

export const MarkWords = {
  /** A mark's words placed on its page; null for a kind that sets none. */
  of: (mark: Mark): MarkWords | null => {
    if (mark.kind === 'stamp')
      return {
        lines: StampLayout.place(mark),
        box: mark.rect,
        faces: StampLayout.faces(mark),
        region: StampLayout.region(mark),
      };
    if (!Mark.isTyped(mark)) return null;
    return {
      lines: TypedLayout.place(mark).map((line) => ({ ...line, size: mark.size, bold: false })),
      box: mark.rect,
      faces: TypedLayout.faces(mark.words),
      region: TypedLayout.region(mark.words),
    };
  },
} as const;
