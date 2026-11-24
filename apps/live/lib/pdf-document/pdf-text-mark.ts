// Making a text mark (docs/specs/035-pdf-documents/marks.md "Making a mark"): the text between two points of a page,
// or a selection, as one mark of a kind in the live changes, in one change. The state names its stored file the first
// time anything is changed (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';
import { standardColours, type BlobKey, type StandardColourName } from '@livedoc/document';
import {
  Mark,
  PdfLiveChanges,
  type PageName,
  type PdfLimitRefusal,
  type TextMarkKind,
  type TextSelection,
} from '@livedoc/pdf-documents';

/** A mark's look as the file holds it: `#rrggbb` and 0.1 to 1. */
export type TextMarkLook = { readonly colour: string; readonly opacity: number };

const on = (tone: 'soft' | 'strong', name: StandardColourName): TextMarkLook => ({
  colour: standardColours(tone, 'light').find((colour) => colour.name === name)!.hex,
  opacity: 1,
});

/** (default) Each kind's first look: a highlight in the soft tone, the line marks in the strong, for light paper. */
export const TEXT_MARK_LOOKS: Readonly<Record<TextMarkKind, TextMarkLook>> = {
  highlight: on('soft', 'yellow'),
  underline: on('strong', 'green'),
  strikeout: on('strong', 'red'),
  squiggly: on('strong', 'blue'),
};

/** Each kind's name in telemetry (marks.md "Telemetry and observability": `Mark.<Kind>`, `Tool.<Name>`). */
export const TEXT_MARK_NAMES = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
  squiggly: 'SquigglyUnderline',
} as const satisfies Readonly<Record<TextMarkKind, string>>;

export type TextMarkMade =
  { ok: true; mark: Mark } | { ok: false; reason: PdfLimitRefusal | 'no_text' };

export function addTextMark(
  doc: Y.Doc,
  kind: TextMarkKind,
  where: { page: PageName; stored: { blob: BlobKey; pages: number } },
  selection: TextSelection | null,
  by: { author: string; now: number; id: string },
): TextMarkMade {
  if (!selection || selection.quads.length === 0) return { ok: false, reason: 'no_text' };
  const mark = Mark.ofText(kind, {
    id: by.id,
    page: where.page,
    quads: selection.quads,
    text: selection.text,
    ...TEXT_MARK_LOOKS[kind],
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
