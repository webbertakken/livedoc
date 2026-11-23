// A PDF document's left panels (docs/specs/035-pdf-documents/reading-surface.md "The left panel"), as the office
// shell's panels (office-shell.md "Side panels"), each with its glyph on the rail. Only built panels are declared:
// the rest of View's panel items are drawn dimmed, "Coming soon", and have no button on the rail.
import { lucideBookmark, lucideGalleryVertical } from '@livedoc/icons/lucide';
import type { OfficeRailPanel } from '@/components/office/OfficePanelRail';
import type { OfficePanelSpec } from '@/lib/office/office-panels';
import { PANEL_OUTLINE, PANEL_THUMBNAILS } from './pdf-menus';

export const THUMBNAILS_PANEL: OfficePanelSpec = {
  id: 'thumbnails',
  title: 'Thumbnails',
  side: 'left',
  item: PANEL_THUMBNAILS,
};

export const OUTLINE_PANEL: OfficePanelSpec = {
  id: 'outline',
  title: 'Outline',
  side: 'left',
  item: PANEL_OUTLINE,
};

/** The rail's panels, in the spec's order. */
export const PDF_RAIL: readonly OfficeRailPanel[] = [
  { spec: THUMBNAILS_PANEL, icon: lucideGalleryVertical },
  { spec: OUTLINE_PANEL, icon: lucideBookmark },
];

export const PDF_PANELS: readonly OfficePanelSpec[] = PDF_RAIL.map((panel) => panel.spec);
