// The spreadsheet's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"), on the right and an
// Editor's: Conditional Format Rules (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213) and
// Alternating Colours (formatting.md "Alternating colours"), Themes ("Themes") and Data Validation Rules
// (data-validation.md "In a spreadsheet"); and Named Ranges and Named Functions, everyone's (data-tools.md "Named
// ranges and named functions").
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export const CONDITIONAL_FORMAT_RULES_PANEL: OfficePanelSpec = {
  id: 'conditional-format-rules',
  title: 'Conditional Format Rules',
  side: 'right',
  item: 'conditional-formatting',
  editorsOnly: true,
};

export const ALTERNATING_COLOURS_PANEL: OfficePanelSpec = {
  id: 'alternating-colours',
  title: 'Alternating Colours',
  side: 'right',
  item: 'alternating-colours',
  editorsOnly: true,
};

export const THEMES_PANEL: OfficePanelSpec = {
  id: 'themes',
  title: 'Themes',
  side: 'right',
  item: 'theme',
  editorsOnly: true,
};

export const DATA_VALIDATION_PANEL: OfficePanelSpec = {
  id: 'data-validation-rules',
  title: 'Data Validation Rules',
  side: 'right',
  item: 'data-validation',
  editorsOnly: true,
};

// Read by everyone; changed by an Editor alone, inside it.
export const NAMED_RANGES_PANEL: OfficePanelSpec = {
  id: 'named-ranges',
  title: 'Named Ranges',
  side: 'right',
  item: 'named-ranges',
};

// Read by everyone; changed by an Editor alone, inside it.
export const NAMED_FUNCTIONS_PANEL: OfficePanelSpec = {
  id: 'named-functions',
  title: 'Named Functions',
  side: 'right',
  item: 'named-functions',
};

// Read by everyone; changed by an Editor alone, inside it (data-tools.md "Protected ranges").
export const PROTECTION_PANEL: OfficePanelSpec = {
  id: 'protected-ranges',
  title: 'Protected Sheets and Ranges',
  side: 'right',
  item: 'protect-sheets-and-ranges',
};

// Table Settings (data-tools.md "Tables"): opened by Convert to Table and the table menu, never from a menu item of its
// own, so its item is bound to nothing; read by everyone, changed by an Editor alone, inside it.
export const TABLE_SETTINGS_PANEL: OfficePanelSpec = {
  id: 'table-settings',
  title: 'Table Settings',
  side: 'right',
  item: 'table-settings',
};

// The Chart Editor (docs/specs/029-sheets/charts.md "Chart Editor"): opened from a chart, never from a menu item of
// its own, so its item is bound to nothing.
export const CHART_EDITOR_PANEL: OfficePanelSpec = {
  id: 'chart-editor',
  title: 'Chart Editor',
  side: 'right',
  item: 'edit-chart',
  editorsOnly: true,
  object: true,
};

// The Pivot Table Editor (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): opened by Create Pivot Table and
// a pivot table's Edit button, never from a menu item of its own, so its item is bound to nothing.
export const PIVOT_EDITOR_PANEL: OfficePanelSpec = {
  id: 'pivot-table-editor',
  title: 'Pivot Table Editor',
  side: 'right',
  item: 'edit-pivot-table',
  editorsOnly: true,
  object: true,
};

// The Slicer panel (data-tools.md "Slicers"): opened by Add a Slicer and a slicer's Edit Slicer, never from a menu
// item of its own, so its item is bound to nothing; an Editor's.
export const SLICER_PANEL: OfficePanelSpec = {
  id: 'slicer',
  title: 'Slicer',
  side: 'right',
  item: 'edit-slicer',
  editorsOnly: true,
  object: true,
};

// Column Stats (data-tools.md "Column Stats"): read by everyone, changing nothing.
export const COLUMN_STATS_PANEL: OfficePanelSpec = {
  id: 'column-stats',
  title: 'Column Stats',
  side: 'right',
  item: 'column-stats',
};

// Clean-up Suggestions (data-tools.md "Clean-up Suggestions"): an Editor's, as each Apply writes (D467).
export const CLEAN_UP_SUGGESTIONS_PANEL: OfficePanelSpec = {
  id: 'clean-up-suggestions',
  title: 'Clean-up Suggestions',
  side: 'right',
  item: 'clean-up-suggestions',
  editorsOnly: true,
};

export const SPREADSHEET_PANELS: readonly OfficePanelSpec[] = [
  CONDITIONAL_FORMAT_RULES_PANEL,
  ALTERNATING_COLOURS_PANEL,
  THEMES_PANEL,
  DATA_VALIDATION_PANEL,
  NAMED_RANGES_PANEL,
  NAMED_FUNCTIONS_PANEL,
  PROTECTION_PANEL,
  TABLE_SETTINGS_PANEL,
  CHART_EDITOR_PANEL,
  SLICER_PANEL,
  PIVOT_EDITOR_PANEL,
  COLUMN_STATS_PANEL,
  CLEAN_UP_SUGGESTIONS_PANEL,
];

/**
 * Format › Convert to Table, Insert › Table, the cell and column menus' and Ctrl+Alt+T (data-tools.md "Tables"): an
 * Editor's; the table made over the selection, then Table Settings open on it.
 */
export function withTablePanel(
  bound: OfficeActions,
  opts: { convert: () => boolean; reveal: () => void; canShape: boolean },
): OfficeActions {
  if (!opts.canShape) return bound;
  const run = () => {
    if (opts.convert()) opts.reveal();
  };
  return { ...bound, 'convert-to-table': { run }, 'insert-table': { run } };
}

/**
 * Format › Alternating Colours: opening the panel over a selection with no banding makes one there at once, in the
 * first default style (formatting.md "Alternating colours", D216); closing it, or opening it on one, writes nothing.
 */
export function withBandingOnOpen(bound: OfficeActions, addBanding: () => void): OfficeActions {
  const item = ALTERNATING_COLOURS_PANEL.item;
  const open = bound[item];
  if (!open) return bound;
  return {
    ...bound,
    [item]: {
      ...open,
      run: () => {
        if (!open.checked) addBanding();
        open.run();
      },
    },
  };
}

/**
 * Data › Data Validation, Insert › Checkbox and Insert › Dropdown (data-validation.md "In a spreadsheet"): the panel's
 * item notes it opens on the active cell's rule; Checkbox makes one over the selection at once; Dropdown opens the
 * panel on a new Dropdown over the selection. Each an Editor's, as the panel is.
 */
export function withValidationPanel(
  bound: OfficeActions,
  opts: { addCheckbox: () => void; opened: (startNew: boolean) => void; reveal: () => void },
): OfficeActions {
  const item = DATA_VALIDATION_PANEL.item;
  const open = bound[item];
  if (!open) return bound;
  return {
    ...bound,
    [item]: {
      ...open,
      run: () => {
        if (!open.checked) opts.opened(false);
        open.run();
      },
    },
    'insert-checkbox': { run: opts.addCheckbox },
    'insert-dropdown': {
      run: () => {
        opts.opened(true);
        opts.reveal();
      },
    },
  };
}

/**
 * Data › Named Ranges and the cell menu's Define Named Range (data-tools.md "Named ranges and named functions"): the
 * panel's item notes it opens as asked (the list, D299); Define Named Range, an Editor's, opens it on Add a Range.
 */
export function withNamedRangesPanel(
  bound: OfficeActions,
  opts: { opened: (startAdding: boolean) => void; reveal: () => void; canShape: boolean },
): OfficeActions {
  const item = NAMED_RANGES_PANEL.item;
  const open = bound[item];
  if (!open) return bound;
  return {
    ...bound,
    [item]: {
      ...open,
      run: () => {
        if (!open.checked) opts.opened(false);
        open.run();
      },
    },
    ...(opts.canShape
      ? {
          'define-named-range': {
            run: () => {
              opts.opened(true);
              opts.reveal();
            },
          },
        }
      : {}),
  };
}

/**
 * Data › Protect Sheets and Ranges and the cell and header menus' Protect Range (data-tools.md "Protected ranges"):
 * the panel's item notes it opens as asked (its list); Protect Range, an Editor's, opens it on a new range over the
 * selection.
 */
export function withProtectionPanel(
  bound: OfficeActions,
  opts: { opened: (start: 'range' | null) => void; reveal: () => void; canShape: boolean },
): OfficeActions {
  const item = PROTECTION_PANEL.item;
  const open = bound[item];
  if (!open) return bound;
  return {
    ...bound,
    [item]: {
      ...open,
      run: () => {
        if (!open.checked) opts.opened(null);
        open.run();
      },
    },
    ...(opts.canShape
      ? {
          'protect-range': {
            run: () => {
              opts.opened('range');
              opts.reveal();
            },
          },
        }
      : {}),
  };
}
