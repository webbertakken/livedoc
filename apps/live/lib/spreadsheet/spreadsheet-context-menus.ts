// The grid's context menus (docs/specs/029-sheets/surface.md "Context menus"): a cell's, a row number's and a column
// letter's, Google's items in Google's order, in Title Case (D125). Each item is the menus' own by id, so one binding
// runs both and an item not yet built stays dimmed; the few only a context menu has are its own. The sheet tab's menu
// is the sheet bar's (SheetTabMenu).
import {
  contextEntries,
  type ContextEntrySpec,
  type OfficeEntry,
  type OfficeItem,
} from '@/lib/office/office-catalogue';
import { PIVOT_DATE_RULES } from '@livedoc/sheets';
import { PIVOT_DATE_RULE_LABELS, pivotDateGroupId } from './pivot-grouping-menu';
import { SPREADSHEET_GRID_MENUS } from './spreadsheet-menus';

/** What a context menu opens on. */
export type SheetContextPlace = 'cell' | 'row' | 'column';

const own = (
  id: string,
  label: string,
  level: OfficeItem['level'],
  status: OfficeItem['status'],
): OfficeItem => ({ kind: 'item', id, label, level, status });

const SEPARATOR = { kind: 'separator' } as const;

const submenu = (
  id: string,
  label: string,
  entries: readonly ContextEntrySpec[],
): ContextEntrySpec => ({ kind: 'submenu', id, label, entries });

// Cut, Copy, Paste and Paste Special head every grid menu, Paste Special as Edit's.
const CLIPBOARD: readonly ContextEntrySpec[] = [
  'cut',
  'copy',
  'paste',
  submenu('context-paste-special', 'Paste Special', [
    'paste-values-only',
    'paste-format-only',
    'paste-formula-only',
    'paste-conditional-formatting-only',
    'paste-data-validation-only',
    'paste-transposed',
    'paste-column-widths-only',
    'paste-all-except-borders',
  ]),
];

// Edit › Delete's Row and Column, named for the context; the binding counts the lines (Delete Rows 2 - 4).
const DELETE_ROWS = { id: 'delete-rows', label: 'Delete Row' };
const DELETE_COLUMNS = { id: 'delete-columns', label: 'Delete Column' };
// Opens Named Ranges on Add a Range over the selection: an Editor's, where Data › Named Ranges is everyone's.
const DEFINE_NAMED_RANGE = own('define-named-range', 'Define Named Range', 'edit', 'built');
// Opens Protect Sheets and Ranges on a new range over the selection: an Editor's (data-tools.md "Protected ranges").
const PROTECT_RANGE = own('protect-range', 'Protect Range', 'edit', 'built');
const VALIDATION: readonly ContextEntrySpec[] = ['conditional-formatting', 'data-validation'];

// Clear, Hide and Resize of the lines selected: a header menu's own (surface.md "Context menus").
const lineItems = (axis: 'rows' | 'columns', noun: string): ContextEntrySpec[] => [
  own(`clear-${axis}`, `Clear ${noun}`, 'edit', 'built'),
  own(`hide-${axis}`, `Hide ${noun}`, 'edit', 'built'),
  own(`resize-${axis}`, `Resize ${noun}`, 'edit', 'built'),
];

// A pivot table's item grouped from its cell, each drawn only where it applies (pivot-tables.md "Grouping in the grid").
const pivotItem = (id: string, label: string): ContextEntrySpec => ({
  ...own(id, label, 'edit', 'built'),
  contextual: true,
});
const PIVOT_GROUPING: readonly ContextEntrySpec[] = [
  submenu(
    'pivot-date-group',
    'Create Pivot Date Group',
    PIVOT_DATE_RULES.map((rule) => pivotItem(pivotDateGroupId(rule), PIVOT_DATE_RULE_LABELS[rule])),
  ),
  pivotItem('pivot-group-rule', 'Create Pivot Group Rule'),
  pivotItem('pivot-group', 'Create Pivot Group'),
  pivotItem('pivot-ungroup', 'Ungroup Pivot Items'),
];

const CELL: readonly ContextEntrySpec[] = [
  // The active cell's link, for anyone, drawn only while it holds one (D189).
  { ...own('open-link', 'Open Link', 'view', 'built'), contextual: true },
  // A pivot table value's source rows on a sheet of their own, drawn only on such a value (pivot-tables.md "Details").
  { ...own('show-pivot-details', 'Show Details', 'view', 'built'), contextual: true },
  // A cell's picture's items, drawn only on a cell holding one, for an Editor (inserted-objects.md "Images in a cell").
  { ...own('cell-picture-alt-text', 'Alt Text', 'edit', 'built'), contextual: true },
  { ...own('place-image-over-cells', 'Place Image over Cells', 'edit', 'built'), contextual: true },
  ...PIVOT_GROUPING,
  SEPARATOR,
  ...CLIPBOARD,
  SEPARATOR,
  'insert-rows-above',
  'insert-columns-left',
  submenu('context-insert-cells', 'Insert Cells', [
    { id: 'insert-cells-shift-right', label: 'Shift Right' },
    { id: 'insert-cells-shift-down', label: 'Shift Down' },
  ]),
  SEPARATOR,
  DELETE_ROWS,
  DELETE_COLUMNS,
  submenu('context-delete-cells', 'Delete Cells', [
    { id: 'delete-cells-shift-left', label: 'Shift Left' },
    { id: 'delete-cells-shift-up', label: 'Shift Up' },
  ]),
  SEPARATOR,
  'create-a-filter',
  own('filter-by-cell-value', 'Filter by Cell Value', 'edit', 'built'),
  SEPARATOR,
  own('show-edit-history', 'Show Edit History', 'edit', 'comingSoon'),
  SEPARATOR,
  ...VALIDATION,
  SEPARATOR,
  { id: 'insert-link', label: 'Insert Link' },
  { id: 'insert-comment', label: 'Comment' },
  { id: 'insert-note', label: 'Insert Note' },
  SEPARATOR,
  'convert-to-table',
  submenu('more-cell-actions', 'View More Cell Actions', [
    own('get-link-to-cell', 'Get Link to This Cell', 'view', 'comingSoon'),
    DEFINE_NAMED_RANGE,
    PROTECT_RANGE,
    'randomise-range',
    'column-stats',
  ]),
];

const ROW: readonly ContextEntrySpec[] = [
  ...CLIPBOARD,
  SEPARATOR,
  'insert-rows-above',
  'insert-rows-below',
  DELETE_ROWS,
  ...lineItems('rows', 'Row'),
  SEPARATOR,
  'create-a-filter',
  SEPARATOR,
  ...VALIDATION,
  SEPARATOR,
  submenu('more-row-actions', 'View More Row Actions', [
    'group-rows',
    'ungroup-rows',
    own('freeze-up-to-this-row', 'Freeze Up to Row', 'edit', 'built'),
    own('get-link-to-range', 'Get Link to This Range', 'view', 'comingSoon'),
    DEFINE_NAMED_RANGE,
    PROTECT_RANGE,
  ]),
];

const COLUMN: readonly ContextEntrySpec[] = [
  ...CLIPBOARD,
  SEPARATOR,
  'insert-columns-left',
  'insert-columns-right',
  DELETE_COLUMNS,
  ...lineItems('columns', 'Column'),
  SEPARATOR,
  'create-a-filter',
  SEPARATOR,
  { id: 'sort-sheet-a-to-z', label: 'Sort Sheet A to Z' },
  { id: 'sort-sheet-z-to-a', label: 'Sort Sheet Z to A' },
  SEPARATOR,
  ...VALIDATION,
  'column-stats',
  SEPARATOR,
  'convert-to-table',
  submenu('more-column-actions', 'View More Column Actions', [
    'group-columns',
    'ungroup-columns',
    own('freeze-up-to-this-column', 'Freeze Up to Column', 'edit', 'built'),
    'randomise-range',
    DEFINE_NAMED_RANGE,
    PROTECT_RANGE,
  ]),
];

/** Each place's entries, resolved against the grid's menus once. */
export const SPREADSHEET_CONTEXT_MENUS: Readonly<
  Record<SheetContextPlace, readonly OfficeEntry[]>
> = {
  cell: contextEntries(SPREADSHEET_GRID_MENUS, CELL),
  row: contextEntries(SPREADSHEET_GRID_MENUS, ROW),
  column: contextEntries(SPREADSHEET_GRID_MENUS, COLUMN),
};
