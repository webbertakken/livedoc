// The spreadsheet's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"): Conditional Format
// Rules on the right (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213), an Editor's.
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export const CONDITIONAL_FORMAT_RULES_PANEL: OfficePanelSpec = {
  id: 'conditional-format-rules',
  title: 'Conditional Format Rules',
  side: 'right',
  item: 'conditional-formatting',
  editorsOnly: true,
};

export const SPREADSHEET_PANELS: readonly OfficePanelSpec[] = [CONDITIONAL_FORMAT_RULES_PANEL];
