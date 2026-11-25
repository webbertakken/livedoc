// The text document's side panels (docs/specs/034-text-documents/editing-surface.md "Layout, top to bottom"): the
// outline on the left (links-and-navigation.md "The outline"); on the right Line numbers (page-layout.md "Line
// numbers"), Watermark (page-layout.md "Watermark"), Table properties (tables.md) and Image options (objects.md
// "Working with a picture") and Table of contents (links-and-navigation.md), an Editor's all; and Comments
// (review.md), everyone's. Version history joins with review.
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export const OUTLINE_PANEL: OfficePanelSpec = {
  id: 'outline',
  title: 'Outline',
  side: 'left',
  item: 'show-outline',
  // View > Show tabs & outlines opens the same outline (links-and-navigation.md "The outline").
  alsoItems: ['show-tabs-and-outlines'],
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

// Format > Image > Image options (objects.md "Working with a picture").
export const IMAGE_OPTIONS_PANEL: OfficePanelSpec = {
  id: 'image-options',
  title: 'Image options',
  side: 'right',
  item: 'image-options',
  editorsOnly: true,
};

// The comments panel, comment history (review.md "The comments panel"): every session's, a Viewer reading it. Its item is
// the shortcut row's id, so ⌘⌥⇧A opens it, and the title row's Comment history runs it.
export const COMMENTS_PANEL: OfficePanelSpec = {
  id: 'comments',
  title: 'Comments',
  side: 'right',
  item: 'open-comment-history',
};

// The selected table of contents' options (links-and-navigation.md "Table of contents"): from its bar.
export const TABLE_OF_CONTENTS_PANEL: OfficePanelSpec = {
  id: 'table-of-contents',
  title: 'Table of contents',
  side: 'right',
  item: 'table-of-contents-options',
  editorsOnly: true,
};

export const TEXT_DOCUMENT_PANELS: readonly OfficePanelSpec[] = [
  OUTLINE_PANEL,
  LINE_NUMBERS_PANEL,
  WATERMARK_PANEL,
  TABLE_PROPERTIES_PANEL,
  IMAGE_OPTIONS_PANEL,
  TABLE_OF_CONTENTS_PANEL,
  COMMENTS_PANEL,
];
