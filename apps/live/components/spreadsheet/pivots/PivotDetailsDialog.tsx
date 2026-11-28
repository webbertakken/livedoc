'use client';

// A value's details for a Participant or a Viewer (docs/specs/029-sheets/pivot-tables.md "Details", Webber's ruling
// 2026-11-28): a read-only table of the source's header and the rows the value summarises, never saved. Close or
// Escape returns the keys to the grid.
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { pivotDetailsCut, type PivotDetailsTable } from '@/lib/spreadsheet/pivot-details-table';

export const PIVOT_DETAILS_TITLE = 'Details';

export function PivotDetailsDialog({
  table,
  onClose,
}: {
  table: PivotDetailsTable;
  onClose: () => void;
}) {
  const cut = pivotDetailsCut(table);
  return (
    <OfficeDialog open wide title={PIVOT_DETAILS_TITLE} onClose={onClose}>
      <div className="min-h-0 overflow-auto rounded-control border border-(--office-line)">
        <table className="w-full border-collapse text-body text-(--office-ink)">
          <thead className="sticky top-0 bg-(--office-chrome)">
            <tr>
              {table.header.map((name, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-b border-(--office-line) px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((text, c) => (
                  <td
                    key={c}
                    className="border-b border-(--office-line) px-3 py-1.5 whitespace-nowrap"
                  >
                    {text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cut ? <p className="pt-3 text-supporting text-(--office-muted)">{cut}</p> : null}
    </OfficeDialog>
  );
}
