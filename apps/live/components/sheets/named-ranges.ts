// The workbook's named ranges as the name box and the Named Ranges panel use them (docs/specs/029-sheets/sheet.md
// "Named ranges", data-tools.md "Named ranges and named functions"): the names listed, the layouts a new name must not
// clash with, and going to one, on this sheet or, through the surface, on another.
import {
  workbookNamedRanges,
  type GridRange,
  type Sheet,
  type SheetLayout,
  type WorkbookNamedRange,
} from '@livedoc/sheets';
import type { SheetController } from './sheet-controller';
import type { OpenSheetAt } from './sheet-navigation';

type NamesView = Pick<SheetController, 'sheet' | 'workbook'>;

// The workbook's sheets, the open one as the controller holds it.
function sheetsOf(c: NamesView): Sheet[] {
  const list = c.workbook.sheetList().map((s) => (s.id === c.sheet.id ? c.sheet : s));
  return list.some((s) => s.id === c.sheet.id) ? list : [c.sheet, ...list];
}

// The names listed: every sheet's when another sheet can be opened, else the open sheet's.
export function listedNames(c: NamesView, open: OpenSheetAt | null): WorkbookNamedRange[] {
  return workbookNamedRanges(open ? sheetsOf(c) : [c.sheet], c.sheet.id);
}

// The layouts of the workbook's sheets other than `sheetId`, which a name on it must not share (D297).
export function otherLayouts(c: NamesView, sheetId: string = c.sheet.id): SheetLayout[] {
  return sheetsOf(c)
    .filter((s) => s.id !== sheetId)
    .map((s) => s.layout);
}

// A name's range selected: here, or on its own sheet opened first.
export function goToNamed(
  c: NamesView,
  goTo: (range: GridRange) => void,
  open: OpenSheetAt | null,
  target: { sheetId: string; range: GridRange },
): void {
  if (target.sheetId === c.sheet.id) goTo(target.range);
  else open?.(target.sheetId, target.range);
}
