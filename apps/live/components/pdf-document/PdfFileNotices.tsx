'use client';

// The notice bar's notices about a PDF's file (docs/specs/035-pdf-documents/reading-surface.md "Notices";
// opening.md "Damaged files", "Passwords"): one bar, showing the first notice not dismissed in the table's order;
// dismissing one shows the next, for this open. Each notice's action opens its dialog: a repaired file's Details,
// the permissions password.
import { useState } from 'react';
import type { PdfPermissions } from '@livedoc/pdf-documents';
import { pdfFileNotices, type PdfFileNoticeId } from '@/lib/pdf-document/pdf-notices';
import { PdfLimitsDialog } from './PdfLimitsDialog';
import { PdfNoticeBar } from './PdfNoticeBar';
import { PdfRepairDialog } from './PdfRepairDialog';

export function PdfFileNotices({
  permissions,
  liftLimits,
  repaired,
  canChange,
}: {
  permissions: PdfPermissions;
  liftLimits: (password: string) => Promise<boolean>;
  repaired: boolean;
  /** Whether the person's mode can change the PDF. */
  canChange: boolean;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<PdfFileNoticeId>>(new Set());
  const [asking, setAsking] = useState<PdfFileNoticeId | null>(null);
  const shown = pdfFileNotices({ repaired, permissions, canChange }).find(
    (notice) => !dismissed.has(notice.id),
  );
  const close = () => setAsking(null);
  return (
    <>
      {shown ? (
        <PdfNoticeBar
          sentence={shown.sentence}
          action={shown.action}
          onAction={() => setAsking(shown.id)}
          onDismiss={() => setDismissed((was) => new Set(was).add(shown.id))}
        />
      ) : null}
      {asking === 'limits' ? <PdfLimitsDialog liftLimits={liftLimits} onClose={close} /> : null}
      {asking === 'repaired' ? <PdfRepairDialog canChange={canChange} onClose={close} /> : null}
    </>
  );
}
