'use client';

// File > Details (docs/specs/004-interface-design/office-shell.md "Dialogs"; docs/specs/034-text-documents/
// files-and-print.md "Details"): one dialog for every kind, a label and its value a row, read only. Nothing to confirm,
// so no button row: the × and Escape close it.
import { OfficeDialog } from './OfficeDialog';
import type { OfficeDetailsRow } from '@/lib/office/office-details';

export function OfficeDetailsDialog({
  rows,
  onClose,
}: {
  rows: readonly OfficeDetailsRow[];
  onClose: () => void;
}) {
  return (
    <OfficeDialog open onClose={onClose} title="Details">
      <table className="w-full text-body">
        <tbody>
          {rows.map(({ label, value }) => (
            <tr key={label} className="border-b border-(--office-line) last:border-b-0">
              <th
                scope="row"
                className="py-2 pr-4 text-left align-top font-normal whitespace-nowrap text-(--office-muted)"
              >
                {label}
              </th>
              <td className="py-2 text-right tabular-nums [overflow-wrap:anywhere]">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </OfficeDialog>
  );
}
