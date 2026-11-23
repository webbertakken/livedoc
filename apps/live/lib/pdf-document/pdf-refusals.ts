// What a person is told when a PDF is not opened (docs/specs/035-pdf-documents/opening.md "Refusals", "Passwords"):
// one sentence a refusal as its heading, what can still be done on the second line, a glyph, whether the stored file
// can still be downloaded; and how each open's outcome is counted ("Telemetry and observability").
import type { IconPrim } from '@livedoc/icons';
import {
  lucideCircleHelp,
  lucideCircleX,
  lucideCloudOff,
  lucideFile,
  lucideHourglass,
  lucideLock,
  lucideTriangleAlert,
} from '@livedoc/icons/lucide';
import type { PdfRefusal } from '@livedoc/pdf-documents';

/** Every named reason the pages' place shows instead of pages. */
export type PdfSurfaceRefusal =
  PdfRefusal | 'file_too_large' | 'files_unavailable' | 'blob_missing';

export const PDF_REFUSAL_COPY: Record<PdfSurfaceRefusal, string> = {
  pdf_damaged: "This PDF is damaged and can't be opened. You can still download the file.",
  pdf_newer:
    'This PDF uses a newer kind of PDF than LiveDoc reads yet. You can still download the file.',
  pdf_certificate_protected:
    "This PDF is locked to specific people's certificates, which LiveDoc doesn't open.",
  pdf_rights_protected: "This PDF is protected by a rights service, which LiveDoc doesn't open.",
  pdf_stopped: 'LiveDoc stopped reading this PDF, because it asked for too much time or memory.',
  file_too_large: 'This file is larger than 100 MB, the most LiveDoc holds for one file.',
  files_unavailable: 'This server has no file storage.',
  blob_missing: "This PDF's file is missing from storage.",
};

/** A refusal's copy as shown: its first sentence the heading, the rest the second line (none where there is none). */
export function pdfRefusalWords(refusal: PdfSurfaceRefusal): {
  sentence: string;
  then: string | null;
} {
  const copy = PDF_REFUSAL_COPY[refusal];
  const end = copy.indexOf('. ');
  return end < 0
    ? { sentence: copy, then: null }
    : { sentence: copy.slice(0, end + 1), then: copy.slice(end + 2) };
}

/** The kind of refusal at a glance; never the only thing that says it. */
export const PDF_REFUSAL_GLYPH: Record<PdfSurfaceRefusal, readonly IconPrim[]> = {
  pdf_damaged: lucideTriangleAlert,
  pdf_newer: lucideCircleHelp,
  pdf_certificate_protected: lucideLock,
  pdf_rights_protected: lucideLock,
  pdf_stopped: lucideHourglass,
  file_too_large: lucideFile,
  files_unavailable: lucideCloudOff,
  blob_missing: lucideCircleX,
};

/** The open password's screen ("Passwords"). */
export const PDF_PASSWORD_COPY = {
  sentence: 'This PDF is protected.',
  then: 'Enter its password to open it.',
  wrong: "That password didn't open this PDF.",
} as const;

/** Whether the stored file's bytes are there to download: every refusal but the ones that say they are not held. */
export const pdfRefusalDownloads = (refusal: PdfSurfaceRefusal): boolean =>
  refusal !== 'files_unavailable' && refusal !== 'blob_missing' && refusal !== 'file_too_large';

/** Whether reading may be tried once more ("Try again"). */
export const pdfRefusalRetries = (refusal: PdfSurfaceRefusal): boolean => refusal === 'pdf_stopped';

/** How an open came out: read as it came, opened with a password, or refused by name. */
export type PdfOpenOutcome = 'read' | 'password' | PdfSurfaceRefusal;

const REFUSED_TYPE: Record<PdfSurfaceRefusal, string> = {
  pdf_damaged: 'Damaged',
  pdf_newer: 'Newer',
  pdf_certificate_protected: 'CertificateProtected',
  pdf_rights_protected: 'RightsProtected',
  pdf_stopped: 'Stopped',
  file_too_large: 'TooLarge',
  files_unavailable: 'NoFileStorage',
  blob_missing: 'BlobMissing',
};

/** The `type` of `Pdf · Opened` for an outcome; never the password or a name. */
export const pdfOpenedType = (outcome: PdfOpenOutcome): string =>
  outcome === 'read'
    ? 'Read'
    : outcome === 'password'
      ? 'PasswordGiven'
      : `Refused.${REFUSED_TYPE[outcome]}`;
