// The text document's side panels (docs/specs/034-text-documents/editing-surface.md "Layout, top to bottom"): the
// outline on the left (links-and-navigation.md "The outline"). Comments and version history join with review.
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export const TEXT_DOCUMENT_PANELS: readonly OfficePanelSpec[] = [
  { id: 'outline', title: 'Outline', side: 'left', item: 'show-outline' },
];
