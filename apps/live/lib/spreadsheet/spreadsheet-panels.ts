// The spreadsheet's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"), on the right and an
// Editor's: Conditional Format Rules (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213) and
// Alternating Colours (formatting.md "Alternating colours").
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

export const SPREADSHEET_PANELS: readonly OfficePanelSpec[] = [
  CONDITIONAL_FORMAT_RULES_PANEL,
  ALTERNATING_COLOURS_PANEL,
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
