// What a PDF's permissions ask of a person here (docs/specs/035-pdf-documents/opening.md "Passwords";
// reading-surface.md "Notices"; editing-modes.md "Switching"): a file that forbids changes is drawn for Viewing until
// its permissions password is given; any limit is said in the notice bar, with the way to lift it.
import type { AccessLevel } from '@livedoc/api-schema';
import { PdfPermissions } from '@livedoc/pdf-documents';

export const PDF_LIMITS_COPY = {
  forbidsChanges: 'This PDF asks not to be changed.',
  limits: 'This PDF limits what can be done with it.',
  action: 'Enter permissions password',
  title: 'Permissions password',
  line: "Its permissions password lifts this PDF's limits for you.",
  wrong: "That password didn't lift this PDF's limits.",
} as const;

/** The notice for what the file asks; null where it asks nothing. */
export function pdfLimitsNotice(permissions: PdfPermissions): string | null {
  if (PdfPermissions.asksNothing(permissions)) return null;
  return PdfPermissions.forbidsChanges(permissions)
    ? PDF_LIMITS_COPY.forbidsChanges
    : PDF_LIMITS_COPY.limits;
}

/** The level the surface is drawn for: Viewing's while the file forbids changes; `null` while it is not read. */
export const pdfLimitedLevel = (
  level: AccessLevel,
  permissions: PdfPermissions | null,
): AccessLevel => (permissions && PdfPermissions.forbidsChanges(permissions) ? 'view' : level);
