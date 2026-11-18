// The pages and articles family (docs/specs/016-platform/web-performance.md): a page's masthead and an article's
// notes, and the article model parts only an article's writing uses (its zones, its margin notes, turning it into
// pages): hooks/editor/useArticles.ts, useArticleIntake.ts, useLeavePages.ts and lib/article-plus-blocked.ts read
// them once the family is in. Loaded through the registry (lib/element-kinds), never imported statically.
export { PageMasthead } from '@/components/canvas/PageMasthead';
export { ArticleNoteFace } from '@/components/canvas/article/ArticleNoteFace';
export {
  articleNoteCorner,
  articleNoteIds,
  isDrawingElement,
  looseOnArticles,
  newArticleNote,
  objectsDraggedOut,
  withArticlesAsPages,
  withElementsIntoZone,
  withNoteMarkersRemoved,
  withNoteMarksRemoved,
  withNotesSettled,
  withZoneContentsRemoved,
  withZoneLanded,
  withZoneMoved,
  withZoneReleased,
  withZoneRemoved,
  withZoneSize,
  withZonesFitted,
  withZonesSettled,
  withZoneWrap,
  zoneAnchorOf,
  zoneCanvasRect,
  zonePlanFor,
} from '@livedoc/document';
