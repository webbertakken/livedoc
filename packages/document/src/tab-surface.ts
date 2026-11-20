// Which surface a tab is worked on, if it is not a canvas (docs/specs/006-document/kinds-outside-the-canvas.md
// "The surface"). A leaf beside the tab kinds: the editor asks it to pick a tab's host, the open path to know whether
// the canvas's code is needed at all.
import { tabKindOf } from './tab-kind';

export const TAB_SURFACES = ['text-document', 'spreadsheet'] as const;
export type TabSurface = (typeof TAB_SURFACES)[number];

// `inSpreadsheet`: the document holds a workbook. Until stored Plan Sheets are migrated
// (docs/specs/029-sheets/migration.md), a sheet tab without one is a Plan Sheet, drawn on the canvas.
export function surfaceOf(
  tab: { kind?: string } | undefined,
  inSpreadsheet: boolean,
): TabSurface | null {
  switch (tabKindOf(tab)) {
    case 'text-document':
      return 'text-document';
    case 'sheet':
      return inSpreadsheet ? 'spreadsheet' : null;
    case 'diagram':
    case 'event-storming':
    case 'board':
    case 'dashboard':
    case 'form':
      return null;
  }
}

// Whether any of a document's tabs is a canvas: only then does the document need the canvas's code.
export function hasCanvasTab(tabs: readonly { kind?: string }[], inSpreadsheet: boolean): boolean {
  return tabs.some((tab) => surfaceOf(tab, inSpreadsheet) === null);
}
