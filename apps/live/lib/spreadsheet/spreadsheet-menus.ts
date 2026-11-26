// The spreadsheet's menus in the office shell (docs/specs/029-sheets/surface.md "Menu bar"; office-shell.md "Menus as
// data"): one entry per planned row of the parity matrix's menus, in its order, its words in Title Case (D125); a row
// left out (C3) has none. Each item names the least share level that sees it; what the grid runs now is `built`, the
// rest `comingSoon`, drawn dimmed until its phase lands. What an item does is bound by its id (spreadsheet-menu-bindings).
import type { AccessLevel } from '@livedoc/api-schema';
import type { NumberFormatKind, WorkbookFormat } from '@livedoc/sheets';
import { formatCodeDraw, formatNumber, serialFromParts } from '@livedoc/sheets';
import { convertedFormat } from '@livedoc/sheets/files';
import type {
  OfficeCatalogue,
  OfficeEntry,
  OfficeItem,
  OfficeMenu,
} from '@/lib/office/office-catalogue';
import { ZOOM_ITEMS } from './spreadsheet-zoom';
import { recentFormatItemId } from './recent-formats';

/** File › Download's native formats, in Google's order: each item's id, the format it writes, its words. */
export const DOWNLOAD_ITEMS: readonly { id: string; format: WorkbookFormat; label: string }[] = [
  { id: 'download-xlsx', format: 'xlsx', label: 'Microsoft Excel (.xlsx)' },
  { id: 'download-ods', format: 'ods', label: 'OpenDocument (.ods)' },
  { id: 'download-fods', format: 'fods', label: 'Flat OpenDocument (.fods)' },
];

/** File › Download's text formats, the open sheet alone (files-and-print.md "Download", D118). */
export const SHEET_DOWNLOAD_ITEMS: readonly { id: string; format: 'csv' | 'tsv'; label: string }[] =
  [
    { id: 'download-csv', format: 'csv', label: 'Comma-separated values (.csv, current sheet)' },
    { id: 'download-tsv', format: 'tsv', label: 'Tab-separated values (.tsv, current sheet)' },
  ];

/** The id File › Convert is bound by; its words name the format it goes to. */
export const CONVERT_ITEM_ID = 'convert';

const CONVERT_LABEL: Record<WorkbookFormat, string> = {
  xlsx: 'Convert to Excel (.xlsx)',
  ods: 'Convert to OpenDocument (.ods)',
  fods: 'Convert to OpenDocument (.ods)',
};

// The Number menu's examples (D190): 1000.12 (negative for Accounting and Financial, 0.1012 for Percent),
// 26 September 2008 15:59:00, and 24:01:00.
const EXAMPLE = 1000.12;
const EXAMPLE_PERCENT = 0.1012;
const EXAMPLE_MOMENT = serialFromParts(2008, 9, 26, 15, 59);
const EXAMPLE_DURATION = 1 + 1 / 1440;

/**
 * Format › Number's kinds the grid formats with, by item id, in Google's order, with their shortcut rows; `dp` where the
 * item fixes the decimals (Currency Rounded), and the value its example draws (formatting.md "Number formats", D190).
 */
export const NUMBER_FORMAT_ITEMS: readonly {
  id: string;
  label: string;
  nf: NumberFormatKind;
  dp?: number;
  example?: number;
  shortcut?: string;
}[] = [
  { id: 'number-automatic', label: 'Automatic', nf: 'auto' },
  { id: 'number-plain-text', label: 'Plain Text', nf: 'text' },
  {
    id: 'number-number',
    label: 'Number',
    nf: 'number',
    example: EXAMPLE,
    shortcut: 'format-as-decimal',
  },
  {
    id: 'number-percent',
    label: 'Percent',
    nf: 'percent',
    example: EXAMPLE_PERCENT,
    shortcut: 'format-as-percentage',
  },
  {
    id: 'number-scientific',
    label: 'Scientific',
    nf: 'scientific',
    example: EXAMPLE,
    shortcut: 'format-as-exponent',
  },
  { id: 'number-accounting', label: 'Accounting', nf: 'accounting', example: -EXAMPLE },
  { id: 'number-financial', label: 'Financial', nf: 'financial', example: -EXAMPLE },
  {
    id: 'number-currency',
    label: 'Currency',
    nf: 'currency',
    example: EXAMPLE,
    shortcut: 'format-as-currency',
  },
  {
    id: 'number-currency-rounded',
    label: 'Currency Rounded',
    nf: 'currency',
    dp: 0,
    example: EXAMPLE,
  },
  {
    id: 'number-date',
    label: 'Date',
    nf: 'date',
    example: EXAMPLE_MOMENT,
    shortcut: 'format-as-date',
  },
  {
    id: 'number-time',
    label: 'Time',
    nf: 'time',
    example: EXAMPLE_MOMENT,
    shortcut: 'format-as-time',
  },
  { id: 'number-date-time', label: 'Date Time', nf: 'datetime', example: EXAMPLE_MOMENT },
  { id: 'number-duration', label: 'Duration', nf: 'duration', example: EXAMPLE_DURATION },
];

/** Format › Font Size's sizes, Google's list. */
export const MENU_FONT_SIZES: readonly number[] = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 36];

/** View › Freeze's fixed choices: rows or columns frozen, by item id. */
export const FREEZE_ITEMS: readonly { id: string; axis: 'r' | 'c'; count: number | 'active' }[] = [
  { id: 'freeze-no-rows', axis: 'r', count: 0 },
  { id: 'freeze-1-row', axis: 'r', count: 1 },
  { id: 'freeze-2-rows', axis: 'r', count: 2 },
  { id: 'freeze-up-to-row', axis: 'r', count: 'active' },
  { id: 'freeze-no-columns', axis: 'c', count: 0 },
  { id: 'freeze-1-column', axis: 'c', count: 1 },
  { id: 'freeze-2-columns', axis: 'c', count: 2 },
  { id: 'freeze-up-to-column', axis: 'c', count: 'active' },
];

type ItemOptions = Partial<
  Pick<OfficeItem, 'keywords' | 'checkable' | 'status' | 'shortcut' | 'note'>
>;

const item = (
  id: string,
  label: string,
  level: AccessLevel,
  options: ItemOptions = {},
): OfficeItem => ({ kind: 'item', id, label, level, status: 'comingSoon', ...options });

const built = (id: string, label: string, level: AccessLevel, options: ItemOptions = {}) =>
  item(id, label, level, { ...options, status: 'built' });

const submenu = (id: string, label: string, entries: OfficeEntry[]): OfficeEntry => ({
  kind: 'submenu',
  id,
  label,
  entries,
});

const SEPARATOR: OfficeEntry = { kind: 'separator' };

const menu = (id: string, label: string, entries: OfficeEntry[]): OfficeMenu => ({
  id,
  label,
  entries,
});

function fileMenu(format: WorkbookFormat): OfficeMenu {
  return menu('file', 'File', [
    submenu('new', 'New', [
      item('new-spreadsheet', 'Spreadsheet', 'view'),
      item('new-from-template', 'From Template Gallery', 'view'),
    ]),
    built('open', 'Open', 'view', { shortcut: 'open' }),
    item('import', 'Import', 'edit'),
    item('make-a-copy', 'Make a Copy', 'view'),
    SEPARATOR,
    submenu('share', 'Share', [
      built('share-with-others', 'Share with Others', 'edit'),
      item('publish-to-web', 'Publish to Web', 'edit'),
    ]),
    submenu('download', 'Download', [
      ...DOWNLOAD_ITEMS.map(({ id, label }) => built(id, label, 'view')),
      item('download-pdf', 'PDF (.pdf)', 'view'),
      item('download-html', 'Web Page (.html, zipped)', 'view'),
      ...SHEET_DOWNLOAD_ITEMS.map(({ id, label }) => built(id, label, 'view')),
    ]),
    built(CONVERT_ITEM_ID, CONVERT_LABEL[convertedFormat(format)], 'edit', {
      keywords: ['format', 'xlsx', 'ods'],
    }),
    SEPARATOR,
    built('rename', 'Rename', 'edit'),
    item('move-to-bin', 'Move to Bin', 'edit', { keywords: ['delete', 'trash'] }),
    SEPARATOR,
    submenu('version-history', 'Version History', [
      item('name-current-version', 'Name Current Version', 'edit'),
      item('see-version-history', 'See Version History', 'edit'),
    ]),
    item('make-available-offline', 'Make Available Offline', 'edit', {
      keywords: ['this browser'],
    }),
    item('details', 'Details', 'view'),
    item('settings', 'Settings', 'edit', { keywords: ['locale', 'time zone', 'calculation'] }),
    SEPARATOR,
    item('print', 'Print', 'view', { shortcut: 'print' }),
  ]);
}

const EDIT_MENU = menu('edit', 'Edit', [
  built('undo', 'Undo', 'participate', { shortcut: 'undo' }),
  built('redo', 'Redo', 'participate', { shortcut: 'redo' }),
  SEPARATOR,
  built('cut', 'Cut', 'participate', { shortcut: 'cut' }),
  built('copy', 'Copy', 'view', { shortcut: 'copy' }),
  built('paste', 'Paste', 'participate', { shortcut: 'paste' }),
  submenu('paste-special', 'Paste Special', [
    built('paste-values-only', 'Values Only', 'participate', {
      shortcut: 'paste-values-only',
    }),
    built('paste-format-only', 'Format Only', 'edit'),
    built('paste-formula-only', 'Formula Only', 'edit'),
    built('paste-conditional-formatting-only', 'Conditional Formatting Only', 'edit'),
    built('paste-data-validation-only', 'Data Validation Only', 'edit'),
    built('paste-transposed', 'Transposed', 'edit'),
    built('paste-column-widths-only', 'Column Widths Only', 'edit'),
    built('paste-all-except-borders', 'All Except Borders', 'edit'),
  ]),
  SEPARATOR,
  submenu('move', 'Move', [
    built('move-row-up', 'Row Up', 'edit'),
    built('move-row-down', 'Row Down', 'edit'),
    built('move-column-left', 'Column Left', 'edit'),
    built('move-column-right', 'Column Right', 'edit'),
  ]),
  submenu('delete', 'Delete', [
    built('delete-values', 'Values', 'participate'),
    built('delete-rows', 'Row', 'edit'),
    built('delete-columns', 'Column', 'edit'),
    built('delete-cells-shift-up', 'Cells and Shift Up', 'edit'),
    built('delete-cells-shift-left', 'Cells and Shift Left', 'edit'),
  ]),
  SEPARATOR,
  item('find-and-replace', 'Find and Replace', 'view', {
    keywords: ['search'],
    shortcut: 'find-and-replace',
  }),
]);

const VIEW_MENU = menu('view', 'View', [
  submenu('show', 'Show', [
    built('show-gridlines', 'Gridlines', 'edit', { checkable: 'checkbox' }),
    item('show-formula-bar', 'Formula Bar', 'view', { checkable: 'checkbox' }),
    built('show-formulas', 'Formulas', 'view', {
      checkable: 'checkbox',
      shortcut: 'show-all-formulas',
    }),
    item('show-protected-ranges', 'Protected Ranges', 'view', { checkable: 'checkbox' }),
  ]),
  submenu('freeze', 'Freeze', [
    ...FREEZE_ITEMS.slice(0, 4).map(freezeItem),
    SEPARATOR,
    ...FREEZE_ITEMS.slice(4).map(freezeItem),
  ]),
  // grid-and-editing.md "Groups and the outline": labels name the selection's lines (spreadsheet-menu-bindings.ts).
  submenu('group', 'Group', [
    built('group-rows', 'Group Rows', 'edit', { shortcut: 'group-rows-or-columns' }),
    built('group-columns', 'Group Columns', 'edit'),
    built('ungroup-rows', 'Ungroup Rows', 'edit', { shortcut: 'ungroup-rows-or-columns' }),
    built('ungroup-columns', 'Ungroup Columns', 'edit'),
    SEPARATOR,
    built('expand-all-row-groups', 'Expand All Row Groups', 'view'),
    built('collapse-all-row-groups', 'Collapse All Row Groups', 'view'),
    built('expand-all-column-groups', 'Expand All Column Groups', 'view'),
    built('collapse-all-column-groups', 'Collapse All Column Groups', 'view'),
  ]),
  SEPARATOR,
  submenu('comments', 'Comments', [
    item('hide-comments', 'Hide Comments', 'view', { checkable: 'radio' }),
    item('minimise-comments', 'Minimise Comments', 'view', { checkable: 'radio' }),
    item('show-all-comments', 'Show All Comments', 'view', { checkable: 'radio' }),
  ]),
  // spreadsheet.md "Sheets in the sheet bar": labelled with the count, opening All Sheets (D180).
  built('hidden-sheets', 'Hidden Sheets', 'edit'),
  SEPARATOR,
  submenu(
    'zoom',
    'Zoom',
    ZOOM_ITEMS.map(({ id, label }) => built(id, label, 'view', { checkable: 'radio' })),
  ),
  // surface.md "Layout": the title row, menus and toolbar step aside (D187, D188).
  built('full-screen', 'Full Screen', 'view'),
]);

function freezeItem({ id, axis, count }: (typeof FREEZE_ITEMS)[number]): OfficeItem {
  const noun = axis === 'r' ? 'Row' : 'Column';
  const label =
    count === 'active'
      ? `Up to ${noun}`
      : count === 0
        ? `No ${noun}s`
        : `${count} ${noun}${count > 1 ? 's' : ''}`;
  return built(id, label, 'edit', { checkable: 'radio' });
}

const INSERT_MENU = menu('insert', 'Insert', [
  submenu('insert-cells', 'Cells', [
    built('insert-cells-shift-right', 'Insert Cells and Shift Right', 'edit'),
    built('insert-cells-shift-down', 'Insert Cells and Shift Down', 'edit'),
  ]),
  submenu('insert-rows', 'Rows', [
    built('insert-rows-above', 'Insert 1 Row Above', 'edit'),
    built('insert-rows-below', 'Insert 1 Row Below', 'edit'),
  ]),
  submenu('insert-columns', 'Columns', [
    built('insert-columns-left', 'Insert 1 Column Left', 'edit'),
    built('insert-columns-right', 'Insert 1 Column Right', 'edit'),
  ]),
  built('insert-sheet', 'Sheet', 'edit', { shortcut: 'insert-new-sheet' }),
  SEPARATOR,
  item('insert-table', 'Table', 'edit'),
  item('insert-timeline', 'Timeline', 'edit'),
  built('insert-chart', 'Chart', 'edit'),
  item('insert-pivot-table', 'Pivot Table', 'edit'),
  submenu('insert-image', 'Image', [
    item('insert-image-in-cell', 'Insert Image in Cell', 'edit'),
    item('insert-image-over-cells', 'Insert Image over Cells', 'edit'),
  ]),
  item('insert-drawing', 'Drawing', 'edit'),
  SEPARATOR,
  item('insert-function', 'Function', 'participate', { keywords: ['formula', 'sum'] }),
  item('insert-link', 'Link', 'edit', { shortcut: 'insert-link' }),
  SEPARATOR,
  built('insert-checkbox', 'Checkbox', 'edit', { keywords: ['tick box'] }),
  built('insert-dropdown', 'Dropdown', 'edit'),
  item('insert-emoji', 'Emoji', 'participate'),
  SEPARATOR,
  item('insert-comment', 'Comment', 'participate', {
    shortcut: 'insert-or-edit-comment',
  }),
  item('insert-note', 'Note', 'edit', { shortcut: 'insert-or-edit-note' }),
]);

// Format, its Number items each with its example in `locale` (D190); none without one (the context menus' lookup).
// The recently used codes (D194) follow Duration, each an item with its example; none, no separator for them.
const recentEntries = (codes: readonly string[]): OfficeEntry[] =>
  codes.length === 0
    ? []
    : [
        SEPARATOR,
        ...codes.map((code, i) =>
          built(recentFormatItemId(i), code, 'edit', {
            checkable: 'radio',
            note: formatCodeDraw(EXAMPLE, code).text,
          }),
        ),
      ];

const formatMenu = (locale: string | null, recentCodes: readonly string[]) =>
  menu('format', 'Format', [
    built('theme', 'Theme', 'edit', { checkable: 'checkbox' }),
    SEPARATOR,
    submenu('number', 'Number', [
      ...NUMBER_FORMAT_ITEMS.map(({ id, label, nf, dp, example, shortcut }) =>
        item(id, label, 'edit', {
          checkable: 'radio',
          status: 'built',
          ...(shortcut ? { shortcut } : {}),
          ...(locale && example !== undefined
            ? { note: formatNumber(example, { nf, ...(dp === undefined ? {} : { dp }) }, locale) }
            : {}),
        }),
      ),
      ...recentEntries(recentCodes),
      SEPARATOR,
      built('custom-currency', 'Custom Currency', 'edit'),
      built('custom-date-and-time', 'Custom Date and Time', 'edit'),
      built('custom-number-format', 'Custom Number Format', 'edit'),
    ]),
    submenu('text', 'Text', [
      built('bold', 'Bold', 'edit', { checkable: 'checkbox', shortcut: 'bold' }),
      built('italic', 'Italic', 'edit', { checkable: 'checkbox', shortcut: 'italic' }),
      built('underline', 'Underline', 'edit', { checkable: 'checkbox', shortcut: 'underline' }),
      built('strikethrough', 'Strikethrough', 'edit', {
        checkable: 'checkbox',
        shortcut: 'strikethrough',
      }),
    ]),
    submenu('alignment', 'Alignment', [
      built('align-left', 'Left', 'edit', { checkable: 'radio', shortcut: 'left-align' }),
      built('align-centre', 'Centre', 'edit', { checkable: 'radio', shortcut: 'center-align' }),
      built('align-right', 'Right', 'edit', { checkable: 'radio', shortcut: 'right-align' }),
      SEPARATOR,
      built('align-top', 'Top', 'edit', { checkable: 'radio' }),
      built('align-middle', 'Middle', 'edit', { checkable: 'radio' }),
      built('align-bottom', 'Bottom', 'edit', { checkable: 'radio' }),
    ]),
    submenu('wrapping', 'Wrapping', [
      built('wrap-overflow', 'Overflow', 'edit', { checkable: 'radio' }),
      built('wrap-wrap', 'Wrap', 'edit', { checkable: 'radio' }),
      built('wrap-clip', 'Clip', 'edit', { checkable: 'radio' }),
    ]),
    submenu('rotation', 'Rotation', [
      built('rotate-none', 'None', 'edit', { checkable: 'radio' }),
      built('rotate-tilt-up', 'Tilt Up', 'edit', { checkable: 'radio' }),
      built('rotate-tilt-down', 'Tilt Down', 'edit', { checkable: 'radio' }),
      built('rotate-stack-vertically', 'Stack Vertically', 'edit', { checkable: 'radio' }),
      built('rotate-up', 'Rotate Up', 'edit', { checkable: 'radio' }),
      built('rotate-down', 'Rotate Down', 'edit', { checkable: 'radio' }),
      built('rotate-custom-angle', 'Custom Angle', 'edit'),
    ]),
    SEPARATOR,
    submenu(
      'font-size',
      'Font Size',
      MENU_FONT_SIZES.map((size) =>
        built(`font-size-${size}`, String(size), 'edit', { checkable: 'radio' }),
      ),
    ),
    submenu('merge-cells', 'Merge Cells', [
      built('merge-all', 'Merge All', 'edit'),
      built('merge-vertically', 'Merge Vertically', 'edit'),
      built('merge-horizontally', 'Merge Horizontally', 'edit'),
      built('unmerge', 'Unmerge', 'edit'),
    ]),
    SEPARATOR,
    item('convert-to-table', 'Convert to Table', 'edit', {
      shortcut: 'convert-range-to-table',
    }),
    built('conditional-formatting', 'Conditional Formatting', 'edit', { checkable: 'checkbox' }),
    built('alternating-colours', 'Alternating Colours', 'edit', { checkable: 'checkbox' }),
    SEPARATOR,
    built('clear-formatting', 'Clear Formatting', 'edit', { shortcut: 'clear-formatting' }),
  ]);

const DATA_MENU = menu('data', 'Data', [
  submenu('sort-sheet', 'Sort Sheet', [
    built('sort-sheet-a-to-z', 'A to Z', 'edit'),
    built('sort-sheet-z-to-a', 'Z to A', 'edit'),
  ]),
  submenu('sort-range', 'Sort Range', [
    built('sort-range-a-to-z', 'A to Z', 'edit'),
    built('sort-range-z-to-a', 'Z to A', 'edit'),
    built('sort-range-advanced', 'Advanced Range Sorting Options', 'edit'),
  ]),
  SEPARATOR,
  built('create-a-filter', 'Create a Filter', 'edit'),
  item('create-group-by-view', 'Create Group by View', 'view'),
  item('create-filter-view', 'Create Filter View', 'view'),
  item('add-a-slicer', 'Add a Slicer', 'edit'),
  SEPARATOR,
  item('protect-sheets-and-ranges', 'Protect Sheets and Ranges', 'edit'),
  item('named-ranges', 'Named Ranges', 'edit'),
  item('named-functions', 'Named Functions', 'edit'),
  item('randomise-range', 'Randomise Range', 'edit'),
  SEPARATOR,
  item('column-stats', 'Column Stats', 'view'),
  built('data-validation', 'Data Validation', 'edit'),
  submenu('data-clean-up', 'Data Clean-up', [
    item('clean-up-suggestions', 'Clean-up Suggestions', 'edit'),
    item('remove-duplicates', 'Remove Duplicates', 'edit'),
    item('trim-whitespace', 'Trim Whitespace', 'edit'),
  ]),
  item('split-text-to-columns', 'Split Text to Columns', 'edit'),
]);

const TOOLS_MENU = menu('tools', 'Tools', [
  item('create-a-new-form', 'Create a New Form', 'edit'),
  SEPARATOR,
  submenu('spelling', 'Spelling', [
    item('spell-check', 'Spell Check', 'edit'),
    item('personal-dictionary', 'Personal Dictionary', 'edit'),
  ]),
  submenu('suggestion-controls', 'Suggestion Controls', [
    item('enable-autocomplete', 'Enable Autocomplete', 'participate', { checkable: 'checkbox' }),
    item('enable-formula-suggestions', 'Enable Formula Suggestions', 'participate', {
      checkable: 'checkbox',
    }),
    item('enable-formula-corrections', 'Enable Formula Corrections', 'participate', {
      checkable: 'checkbox',
    }),
    item('enable-named-function-suggestions', 'Enable Named Function Suggestions', 'participate', {
      checkable: 'checkbox',
    }),
  ]),
  submenu('notification-settings', 'Notification Settings', [
    item('notification-rules', 'Notification Rules', 'edit'),
    item('comment-notifications', 'Comment Notifications', 'participate'),
  ]),
  item('accessibility', 'Accessibility', 'view', { keywords: ['screen reader'] }),
  SEPARATOR,
  item('activity-dashboard', 'Activity Dashboard', 'edit'),
]);

const HELP_MENU = menu('help', 'Help', [
  built('search-the-menus', 'Search the Menus', 'view', {
    shortcut: 'tool-finder',
    keywords: ['tool finder'],
  }),
  SEPARATOR,
  item('help', 'Help', 'view'),
  SEPARATOR,
  item('privacy-policy', 'Privacy Policy', 'view'),
  item('terms-of-service', 'Terms of Service', 'view'),
  SEPARATOR,
  item('function-list', 'Function List', 'view'),
  built('keyboard-shortcuts', 'Keyboard Shortcuts', 'view', {
    shortcut: 'show-common-keyboard-shortcuts',
  }),
]);

/** The menus over the grid, whatever the file: the context menus take their items from these by id. */
export const SPREADSHEET_GRID_MENUS: OfficeCatalogue = [
  EDIT_MENU,
  VIEW_MENU,
  INSERT_MENU,
  formatMenu(null, []),
  DATA_MENU,
];

/**
 * The spreadsheet's menus for its file's format, the Number menu's examples drawn in its locale (D190), its recently
 * used codes after Duration (D194).
 */
export function spreadsheetMenus(
  format: WorkbookFormat,
  locale: string,
  recentCodes: readonly string[] = [],
): OfficeCatalogue {
  return [
    fileMenu(format),
    EDIT_MENU,
    VIEW_MENU,
    INSERT_MENU,
    formatMenu(locale, recentCodes),
    DATA_MENU,
    TOOLS_MENU,
    HELP_MENU,
  ];
}
