// The notices about a PDF's file, in the notice bar's order (docs/specs/035-pdf-documents/reading-surface.md
// "Notices"): repaired first, then what its permissions ask. Each is one sentence and one action.
import type { PdfPermissions } from '@livedoc/pdf-documents';
import { PDF_LIMITS_COPY, pdfLimitsNotice } from './pdf-limits';

/** opening.md "Damaged files": the notice, and Details' dialog. */
export const PDF_REPAIRED_COPY = {
  notice: 'This PDF was damaged. LiveDoc repaired it to show it; the file itself is unchanged.',
  changes: 'Changes to this PDF are saved as a repaired copy.',
  action: 'Details',
  title: 'Repaired PDF',
  rebuilt:
    "LiveDoc rebuilt this PDF's index of where each part of the file lies, to show it. The file itself is unchanged.",
  saved:
    'Changes are saved as a repaired copy: the whole file written anew, never added to its end.',
} as const;

export type PdfFileNoticeId = 'repaired' | 'limits';

export type PdfFileNotice = {
  readonly id: PdfFileNoticeId;
  readonly sentence: string;
  readonly action: string;
};

/** What the bar has to say of this file, in its order; `canChange`: whether the person's mode can change the PDF. */
export function pdfFileNotices({
  repaired,
  permissions,
  canChange,
}: {
  repaired: boolean;
  permissions: PdfPermissions;
  canChange: boolean;
}): PdfFileNotice[] {
  const notices: PdfFileNotice[] = [];
  if (repaired)
    notices.push({
      id: 'repaired',
      sentence: canChange
        ? `${PDF_REPAIRED_COPY.notice} ${PDF_REPAIRED_COPY.changes}`
        : PDF_REPAIRED_COPY.notice,
      action: PDF_REPAIRED_COPY.action,
    });
  const limits = pdfLimitsNotice(permissions);
  if (limits) notices.push({ id: 'limits', sentence: limits, action: PDF_LIMITS_COPY.action });
  return notices;
}
