'use client';

// A repaired PDF's Details (docs/specs/035-pdf-documents/opening.md "Damaged files"): the shell's dialog naming what
// LiveDoc rebuilt to show the file, and, where the person's mode can change the PDF, how its changes are saved.
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { PDF_REPAIRED_COPY } from '@/lib/pdf-document/pdf-notices';

export function PdfRepairDialog({
  canChange,
  onClose,
}: {
  canChange: boolean;
  onClose: () => void;
}) {
  return (
    <OfficeDialog open onClose={onClose} title={PDF_REPAIRED_COPY.title}>
      <p className="text-body">{PDF_REPAIRED_COPY.rebuilt}</p>
      {canChange ? <p className="mt-2 text-body">{PDF_REPAIRED_COPY.saved}</p> : null}
    </OfficeDialog>
  );
}
