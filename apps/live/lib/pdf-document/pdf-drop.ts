// PDFs dropped on the Explorer (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening"): each file becomes a
// PDF document in the folder in view; several make several, said in one sentence, with the first opened. A refusal
// is said by name, and nothing is made of that file.
import { openPdfFile, PDF_ARRIVAL_COPY, type OpenedPdf } from './open-pdf-file';

export type DroppedPdfs = {
  /** The documents made, in the order the files were dropped. */
  documentIds: readonly string[];
  /** What to say when something was made, and what to say of what was not; either may be absent. */
  made: string | null;
  refused: string | null;
};

type Opener = (file: File) => Promise<OpenedPdf>;

export async function openDroppedPdfs(files: readonly File[], open: Opener): Promise<DroppedPdfs> {
  const documentIds: string[] = [];
  let refused: string | null = null;
  // One at a time: two uploads of tens of megabytes at once would each be slower, and the first is opened.
  for (const file of files) {
    const opened = await open(file);
    if (opened.ok) documentIds.push(opened.documentId);
    else refused ??= PDF_ARRIVAL_COPY[opened.refusal];
  }
  const made = documentIds.length > 1 ? `${documentIds.length} PDFs added` : null;
  return { documentIds, made, refused };
}

/** Opens each dropped file as a PDF document for `ownerId`, in `folderId` (undefined: the person's default place). */
export const pdfOpenerFor =
  (ownerId: string, folderId: string | undefined): Opener =>
  (file) =>
    openPdfFile(ownerId, file, folderId);
