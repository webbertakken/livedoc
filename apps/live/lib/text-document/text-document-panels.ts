// The text document's side panels (docs/specs/034-text-documents/editing-surface.md "Layout, top to bottom"): the
// outline on the left (links-and-navigation.md "The outline"); on the right Line numbers (page-layout.md "Line
// numbers"), Watermark (page-layout.md "Watermark") and Table properties (tables.md), an Editor's all. Comments and version history join with review.
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

export const WATERMARK_PANEL: OfficePanelSpec = {
  id: 'watermark',
  title: 'Watermark',
  side: 'right',
  item: 'watermark',
  editorsOnly: true,
};

// Format > Table > Table properties (tables.md "Table properties").
export const TABLE_PROPERTIES_PANEL: OfficePanelSpec = {
  id: 'table-properties',
  title: 'Table properties',
  side: 'right',
  item: 'table-properties',
  editorsOnly: true,
};

export const TEXT_DOCUMENT_PANELS: readonly OfficePanelSpec[] = [
  OUTLINE_PANEL,
  LINE_NUMBERS_PANEL,
  WATERMARK_PANEL,
  TABLE_PROPERTIES_PANEL,
];
