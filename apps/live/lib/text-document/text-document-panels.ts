// The text document's side panels (docs/specs/034-text-documents/editing-surface.md "Layout, top to bottom"): the
// outline on the left (links-and-navigation.md "The outline"); Line numbers on the right, an Editor's
// (page-layout.md "Line numbers"). Comments and version history join with review.
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export const OUTLINE_PANEL: OfficePanelSpec = {
  id: 'outline',
  title: 'Outline',
  side: 'left',
  item: 'show-outline',
};

export const LINE_NUMBERS_PANEL: OfficePanelSpec = {
  id: 'line-numbers',
  title: 'Line numbers',
  side: 'right',
  item: 'line-numbers',
  editorsOnly: true,
};

export const TEXT_DOCUMENT_PANELS: readonly OfficePanelSpec[] = [OUTLINE_PANEL, LINE_NUMBERS_PANEL];
