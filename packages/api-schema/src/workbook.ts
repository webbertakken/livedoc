// A spreadsheet's workbook changed through the api (docs/specs/029-sheets/sheet-store.md "Changing the workbook"):
// its sheets added, renamed and deleted with their tabs, and its settings saved. The request and response bodies; the
// shapes come from @livedoc/sheets.

import type { WorkbookFormat, WorkbookRecord, WorkbookSettings } from '@livedoc/sheets';
import type { ConversionLoss } from '@livedoc/sheets/files';
import type { SheetDto } from './sheets';

export type { WorkbookSettings } from '@livedoc/sheets';

// A sheet tab added: its name (by the sheet name's rules; `Sheet<n>` when absent), the tab it follows (last when
// absent), and its tab and sheet ids when the caller names them (an undo, a sync).
export type WorkbookSheetAddRequest = {
  name?: string;
  after?: string;
  tabId?: string;
  sheetId?: string;
  // Duplicate: the live sheet copied, layout and cells whole, after its tab unless `after` names one (sheet-store.md
  // "Changing the workbook").
  copyOf?: string;
};

// The sheet tab as it landed: its place in the document's tabs, and its sheet whole.
export type WorkbookSheetTabDto = { id: string; name: string; orderIndex: number };

export type WorkbookSheetAddResponse = { tab: WorkbookSheetTabDto; sheet: SheetDto };

export type WorkbookSheetRenameRequest = { name: string };

// A sheet's tab moved after the tab named, or first for an empty name (spreadsheet.md "Sheets in the sheet bar").
export type WorkbookSheetMoveRequest = { after: string };

// The moved tab's place in the document's tabs.
export type WorkbookSheetMoveResponse = { tabId: string; sheetId: string; orderIndex: number };

// The sheet's title and its tab's name, as one, and the sheet's new rev.
export type WorkbookSheetRenameResponse = {
  tabId: string;
  sheetId: string;
  name: string;
  rev: number;
};

// The settings, whole: the dialog's Save Settings writes every one of them.
export type WorkbookSettingsRequest = { settings: WorkbookSettings };

export type WorkbookSettingsResponse = { workbook: WorkbookRecord; rev: number };

// GET /documents/:id/workbook/conversion?to=<format>: what a file in `to` cannot hold that one in the workbook's own
// format could (files-and-print.md "Converting"), one entry a kind; none within one standard.
export type WorkbookConversionResponse = {
  from: WorkbookFormat;
  to: WorkbookFormat;
  losses: ConversionLoss[];
};

// POST /documents/:id/workbook/conversion: the workbook converted to `format`, of the other standard. Answered with
// the record as it now stands (WorkbookSettingsResponse).
export type WorkbookConvertRequest = { format: WorkbookFormat };

// POST /documents/:id/workbook/imports with a body: connect the spreadsheets its IMPORTRANGEs read (formulas.md
// "Connecting two spreadsheets"); without one, allow its web imports (imports.md "Allow access").
export type WorkbookConnectRequest = { sources: string[] };

// What only the workbook's doors refuse; the rest are the sheet store's (SHEET_ERRORS).
export const WORKBOOK_ERRORS = [
  // The document is no spreadsheet.
  'workbook_not_found',
  // A settings body that is not the workbook's settings.
  'settings_invalid',
  // A file or a conversion asked in a format that is none (files-and-print.md).
  'file_type_unknown',
  // A conversion to the standard the workbook is already in (files-and-print.md "Converting").
  'format_same_standard',
  // An import fetched for a spreadsheet an Editor has not allowed (imports.md "Allow access").
  'imports_not_allowed',
  // An import's query string that is no import.
  'import_invalid',
  // A picture IMAGE asked for that is not fetched, not a picture, or kept where Google refuses (imports.md "IMAGE").
  'image_refused',
  // A connect body whose sources are not document ids (formulas.md "Connecting two spreadsheets").
  'range_sources_invalid',
  // A connect past the sources a workbook keeps (WORKBOOK_RANGE_SOURCES_MAX).
  'range_sources_full',
] as const;
export type WorkbookError = (typeof WORKBOOK_ERRORS)[number];

// The room op for the settings saved (a system op: only the api sends it), with the workbook row's new rev.
export type WorkbookRoomOp = { kind: 'workbook'; workbook: WorkbookRecord; rev: number };
