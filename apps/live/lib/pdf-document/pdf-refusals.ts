// What a person is told when a PDF is not opened (docs/specs/035-pdf-documents/opening.md "Refusals"): one sentence a
// refusal, and whether the stored file can still be downloaded.
import type { PdfRefusal } from '@livedoc/pdf-documents';

/** Every named reason the pages' place shows instead of pages. */
export type PdfSurfaceRefusal =
  PdfRefusal | 'pdf_password' | 'file_too_large' | 'files_unavailable' | 'blob_missing';

export const PDF_REFUSAL_COPY: Record<PdfSurfaceRefusal, string> = {
  pdf_damaged: "This PDF is damaged and can't be opened. You can still download the file.",
  pdf_newer:
    'This PDF uses a newer kind of PDF than LiveDoc reads yet. You can still download the file.',
  pdf_certificate_protected:
    "This PDF is locked to specific people's certificates, which LiveDoc doesn't open.",
  pdf_rights_protected: "This PDF is protected by a rights service, which LiveDoc doesn't open.",
  pdf_stopped: 'LiveDoc stopped reading this PDF, because it asked for too much time or memory.',
  // The password's entry is not built yet: the file is kept exactly and downloads as it came.
  pdf_password: 'This PDF is protected. You can still download the file.',
  file_too_large: 'This file is larger than 100 MB, the most LiveDoc holds for one file.',
  files_unavailable: 'This server has no file storage.',
  blob_missing: "This PDF's file is missing from storage.",
};

/** Whether the stored file's bytes are there to download: every refusal but the ones that say they are not held. */
export const pdfRefusalDownloads = (refusal: PdfSurfaceRefusal): boolean =>
  refusal !== 'files_unavailable' && refusal !== 'blob_missing' && refusal !== 'file_too_large';

/** Whether reading may be tried once more ("Try again"). */
export const pdfRefusalRetries = (refusal: PdfSurfaceRefusal): boolean => refusal === 'pdf_stopped';
