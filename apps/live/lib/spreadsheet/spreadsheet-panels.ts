// The spreadsheet's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"), on the right and an
// Editor's: Conditional Format Rules (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213) and
// Alternating Colours (formatting.md "Alternating colours"), Themes ("Themes") and Data Validation Rules
// (data-validation.md "In a spreadsheet"); and Named Ranges, everyone's (data-tools.md "Named ranges and named
// functions").
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

// The Chart Editor (docs/specs/029-sheets/charts.md "Chart Editor"): opened from a chart, never from a menu item of
// its own, so its item is bound to nothing.
export const CHART_EDITOR_PANEL: OfficePanelSpec = {
  id: 'chart-editor',
  title: 'Chart Editor',
  side: 'right',
  item: 'edit-chart',
  editorsOnly: true,
};

export const SPREADSHEET_PANELS: readonly OfficePanelSpec[] = [
  CONDITIONAL_FORMAT_RULES_PANEL,
  ALTERNATING_COLOURS_PANEL,
  THEMES_PANEL,
  DATA_VALIDATION_PANEL,
  NAMED_RANGES_PANEL,
  CHART_EDITOR_PANEL,
];

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
