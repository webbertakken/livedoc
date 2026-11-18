// A document create's workbook (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): what makes the new
// document a spreadsheet. Read before anything is written: a record that is not one is refused, and so is a workbook
// over tabs that are not all sheet tabs, since a spreadsheet holds only sheets ("The workbook shape").
import { WorkbookRecord } from '@livedoc/sheets';
import { tabKindOf, type Tab } from '@livedoc/document';
import { json } from '../responses';

export type SeedWorkbook = WorkbookRecord | null;

function refused(error: 'workbook_invalid' | 'tab_kind_mixed'): Response {
  console.info('[workbook] refused', { error });
  return json({ error }, { status: 400 });
}

export function readSeedWorkbook(raw: unknown, tabs: readonly Tab[] | null): SeedWorkbook | Response {
  if (raw === undefined || raw === null) return null;
  const record = WorkbookRecord.read(raw);
  if (!record) return refused('workbook_invalid');
  if (!tabs || tabs.length === 0 || tabs.some((tab) => tabKindOf(tab) !== 'sheet'))
    return refused('tab_kind_mixed');
  return record;
}
