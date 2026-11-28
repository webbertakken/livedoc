// What a Viewer's socket receives of a room op (docs/specs/034-text-documents/review.md "What a Viewer receives";
// live-editing-and-storage.md "A Viewer's copy"): a text document's update never, only what the tab's Viewer copy
// gained from it, as the room sequenced it beside the update; no one's caret (review.md: Google's Viewing mode shows no
// cursors, and a caret beside a suggestion as it appears would say whose it is); a tab's `stale` and every other op as
// they are.
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';

// A text document caret's op kind (room-messages.ts).
const TEXT_DOCUMENT_CARET = 'text-document-caret';

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
  if (frame.kind === TEXT_DOCUMENT_CARET) return null;
  // A spreadsheet's comment thread never reaches a Viewer (docs/specs/029-sheets/review.md "Who may do what", D655).
  if (frame.kind === 'sheet-thread') return null;
  if (frame.kind !== TEXT_DOCUMENT_LIVE_TAB.frame || frame.stale === true) return op;
  if (forViewers.has(op)) return forViewers.get(op) ?? null;
  if (missing === 'drop' || typeof frame.tabId !== 'string') return null;
  return { kind: TEXT_DOCUMENT_LIVE_TAB.frame, tabId: frame.tabId, stale: true };
}
