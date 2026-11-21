// The live tab kinds the room stores (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"), one entry a
// kind; a new kind adds its entry here and its schema step to the room's schema.
import { PDF_LIVE_TAB } from '../pdf-documents/pdf-live-tab';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import type { LiveTabKind } from './live-tab-kind';

export const LIVE_TAB_KINDS: readonly LiveTabKind[] = [TEXT_DOCUMENT_LIVE_TAB, PDF_LIVE_TAB];

/** The live tab kind a tab's body is of, or null for any other kind. */
export const liveTabKindOfTab = (
  body: { kind?: unknown } | undefined,
  kinds: readonly LiveTabKind[] = LIVE_TAB_KINDS,
): LiveTabKind | null => kinds.find((k) => k.tabKind === body?.kind) ?? null;

/** The live tab kind whose frames have this op kind, or null. */
export const liveTabKindOfFrame = (
  opKind: unknown,
  kinds: readonly LiveTabKind[] = LIVE_TAB_KINDS,
): LiveTabKind | null => kinds.find((k) => k.frame === opKind) ?? null;
