// A value's details as a Participant or a Viewer sees them (docs/specs/029-sheets/pivot-tables.md "Details", Webber's
// ruling 2026-11-28): the source's header and the rows Details1 would hold, each cell as the grid shows it, up to
// PIVOT_DETAILS_SHOWN rows. Nothing written. Pure.
import type { PivotDetails, Workbook } from '@livedoc/sheets';
import { cellSpokenValue } from '@/components/sheets/sheet-cell-speech';

/** The most rows the Details dialog draws (default). */
export const PIVOT_DETAILS_SHOWN = 1000;

export type PivotDetailsTable = {
  header: readonly string[];
  rows: readonly (readonly string[])[];
  // Every row the value summarises, the header aside: more than `rows` holds when they were cut.
  total: number;
};

/** What the dialog says under a table cut short, or null when every row is drawn. */
export function pivotDetailsCut(t: PivotDetailsTable): string | null {
  return t.total > t.rows.length
    ? `Showing the first ${t.rows.length.toLocaleString('en-GB')} of ${t.total.toLocaleString('en-GB')} rows`
    : null;
}

export function pivotDetailsTable(
  wb: Workbook,
  details: PivotDetails,
  locale: string,
): PivotDetailsTable {
  const source = wb.sheet(details.sheetId);
  const [head, ...body] = details.rows;
  if (!source || head === undefined) return { header: [], rows: [], total: 0 };
  const line = (r: number) => {
    const out: string[] = [];
    for (let c = details.c1; c <= details.c2; c++)
      out.push(cellSpokenValue(source, wb, locale, r, c));
    return out;
  };
  return {
    header: line(head),
    rows: body.slice(0, PIVOT_DETAILS_SHOWN).map(line),
    total: body.length,
  };
}
