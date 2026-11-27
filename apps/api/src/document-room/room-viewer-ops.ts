// What a Viewer's socket receives of a room op (docs/specs/034-text-documents/review.md "What a Viewer receives";
// live-editing-and-storage.md "A Viewer's copy"): a text document's update never, only what the tab's Viewer copy
// gained from it, as the room sequenced it beside the update; a tab's `stale` and every other op as they are.
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';

/** What Viewers receive in place of each sequenced op, by the op; null for nothing. */
export type ViewerOps = WeakMap<object, unknown>;

/**
 * The op as a Viewer receives it, or null for none. A text document update the room sequenced nothing beside is
 * withheld live (`drop`: no Viewer holds a copy of its tab) and replayed as its tab's `stale` (`stale`: the catch-up
 * reads the copy then).
 */
export function viewerOpOf(op: unknown, forViewers: ViewerOps, missing: 'drop' | 'stale'): unknown {
  if (typeof op !== 'object' || op === null) return op;
  const frame = op as { kind?: unknown; tabId?: unknown; stale?: unknown };
  if (frame.kind !== TEXT_DOCUMENT_LIVE_TAB.frame || frame.stale === true) return op;
  if (forViewers.has(op)) return forViewers.get(op) ?? null;
  if (missing === 'drop' || typeof frame.tabId !== 'string') return null;
  return { kind: TEXT_DOCUMENT_LIVE_TAB.frame, tabId: frame.tabId, stale: true };
}
