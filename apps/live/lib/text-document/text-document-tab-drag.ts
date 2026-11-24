// Dragging a document tab in the outline (docs/specs/034-text-documents/links-and-navigation.md "A tab's menu",
// Dragging): where over another tab's row a drop lands.
import type { DocumentTabDropPlace } from '@livedoc/text-documents';

// The share of a row at its top (before) and at its bottom (after) `(default)`; the rest drops into it.
export const TAB_DROP_EDGE = 0.25;

// The drag's data type: drags of anything else are left alone.
export const TAB_DRAG_TYPE = 'application/x-livedoc-document-tab';

/** Where a drop `offset` px below the top of a row `height` px tall lands; below a tab with subtabs are its subtabs. */
export function tabDropPlace(
  offset: number,
  height: number,
  hasSubtabs: boolean,
): DocumentTabDropPlace {
  if (height <= 0) return 'into';
  const share = offset / height;
  if (share < TAB_DROP_EDGE) return 'before';
  if (share > 1 - TAB_DROP_EDGE && !hasSubtabs) return 'after';
  return 'into';
}
