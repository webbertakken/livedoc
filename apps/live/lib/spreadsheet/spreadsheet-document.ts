// A spreadsheet's tabs and its new content (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): each sheet
// is a tab of kind `sheet`, named as its sheet is; its cells are not on the tab but in the room's sheet store, and the
// workbook row beside them says the document is a spreadsheet.
import type { Tab } from '@livedoc/document';
import {
  workbookSheetLayout,
  makeSheetId,
  WORKBOOK_FIRST_SHEET_NAME,
  WorkbookRecord,
} from '@livedoc/sheets';
import type { NewDocumentContent } from '@/lib/new-document-content';

export function newSheetTab(tabId: string, name: string): Tab {
  return { id: tabId, name, kind: 'sheet', elements: [] };
}

/** The workbook record for one made in this browser: its maker's locale and time zone. */
export function workbookMadeHere(): WorkbookRecord {
  return WorkbookRecord.create({
    locale: navigator.language || 'en-GB',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
}

/** A blank spreadsheet: one sheet tab, Sheet1, 1,000 rows by 26 columns, and no card types or example cards. */
export function spreadsheetDocumentContent(tabId: string): NewDocumentContent {
  return {
    tabs: null,
    tab: newSheetTab(tabId, WORKBOOK_FIRST_SHEET_NAME),
    itemTypes: null,
    seedItems: [],
    sheets: [
      {
        id: makeSheetId(),
        tabId,
        title: WORKBOOK_FIRST_SHEET_NAME,
        layout: workbookSheetLayout(),
      },
    ],
    workbook: workbookMadeHere(),
  };
}
