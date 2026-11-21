// Making a highlight (docs/specs/035-pdf-documents/marks.md "Making a mark"): the text between two points of a page,
// as one mark in the live changes, in one change. The state names its stored file the first time anything is changed
// (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  Mark,
  PdfLiveChanges,
  type PageName,
  type PdfLimitRefusal,
  type TextSelection,
} from '@livedoc/pdf-documents';

/** The origin a person's own change is made with. */
export const PDF_LOCAL_ORIGIN = 'pdf-local';

/** (default) A highlight's first look: the colour picker's soft Yellow for light paper, at full opacity. */
export const HIGHLIGHT_COLOUR =
  standardColours('soft', 'light').find((colour) => colour.name === 'yellow')?.hex ?? '#fef9c3';
export const HIGHLIGHT_OPACITY = 1;

export type HighlightMade =
  { ok: true; mark: Mark } | { ok: false; reason: PdfLimitRefusal | 'no_text' };

export function addHighlight(
  doc: Y.Doc,
  where: { page: PageName; stored: { blob: BlobKey; pages: number } },
  selection: TextSelection | null,
  by: { author: string; now: number; id: string },
): HighlightMade {
  if (!selection || selection.quads.length === 0) return { ok: false, reason: 'no_text' };
  const mark = Mark.highlight({
    id: by.id,
    page: where.page,
    quads: selection.quads,
    text: selection.text,
    colour: HIGHLIGHT_COLOUR,
    opacity: HIGHLIGHT_OPACITY,
    author: by.author,
    createdAt: by.now,
  });
  if (!mark) return { ok: false, reason: 'no_text' };
  let refusal: PdfLimitRefusal | null = null;
  doc.transact(() => {
    if (!PdfLiveChanges.stored(doc)) PdfLiveChanges.setStored(doc, where.stored, PDF_LOCAL_ORIGIN);
    refusal = PdfLiveChanges.addMark(doc, mark, PDF_LOCAL_ORIGIN);
  }, PDF_LOCAL_ORIGIN);
  return refusal ? { ok: false, reason: refusal } : { ok: true, mark };
}
