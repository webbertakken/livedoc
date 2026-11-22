// Carrying a surface's unconfirmed changes onto another stored file (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "A change carried across a replacement"): the new file says what a change can stand
// on, its pages' names and the ids of its own marks on the pages the changes name, and each change is made again by
// its anchor. What cannot be placed is counted, to be said.
import type * as Y from 'yjs';
import {
  PdfUnconfirmed,
  type FileMark,
  type PageInfo,
  type UnconfirmedChange,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';

/** The origin a carried change is made with: sent as any change is, and no step of the person's undo. */
export const PDF_CARRY_ORIGIN = 'pdf-carried';

/** The file the changes are carried onto, as its engine reads it. */
export type PdfCarryOnto = {
  pages: readonly PageInfo[];
  fileMarks: (index: number) => Promise<readonly FileMark[]>;
};

const pageOf = (change: UnconfirmedChange): unknown => (change.made ?? change.held)?.['page'];

/** Makes the changes again on `doc`, the live changes of `file`; answers how many could not be placed. */
export async function carryPdfChanges(
  doc: Y.Doc,
  changes: readonly UnconfirmedChange[],
  file: PdfCarryOnto,
): Promise<number> {
  if (changes.length === 0) return 0;
  const named = new Set(changes.filter((change) => change.root === 'marks').map(pageOf));
  const marked = file.pages.flatMap((page, index) => (named.has(page.name) ? [index] : []));
  let fileMarks: readonly FileMark[];
  try {
    fileMarks = (await Promise.all(marked.map((index) => file.fileMarks(index)))).flat();
  } catch (error) {
    // Without the file's own marks a mark it already holds cannot be told from one to make: nothing is guessed.
    debugLog(`[pdf] anchors-lost count=${changes.length} reason=unread`, String(error));
    return changes.length;
  }
  const { carried, already, lost } = PdfUnconfirmed.carry(
    doc,
    changes,
    {
      pages: new Set(file.pages.map((page) => page.name)),
      fileMarks: new Set(fileMarks.map((mark) => mark.id)),
    },
    PDF_CARRY_ORIGIN,
  );
  debugLog(`[pdf] changes-carried count=${carried} already=${already}`);
  if (lost.length > 0) debugLog(`[pdf] anchors-lost count=${lost.length}`);
  return lost.length;
}
