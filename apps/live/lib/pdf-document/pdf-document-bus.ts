// Where a PDF document's live changes from the room meet its surface (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Storage", "The room's op kinds"): the PDF document's bus, as every live tab kind has one
// (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"). Every editor loads it: nothing of the engine or
// the model may come with it.
import type {
  LiveTabLimitName,
  LiveTabRefusalName,
  PdfReplacementRefusalName,
} from '@livedoc/api-schema';
import { liveTabBus } from '@/lib/live-tab/live-tab-bus';

/** Why the room refused a change, as it names it in `pdf-refused`: the limit passed, or the refusal's name. */
export type PdfDocumentRefusal = LiveTabLimitName | LiveTabRefusalName;

export const PdfDocumentBus = liveTabBus<PdfDocumentRefusal>('[pdf]');

type Listeners<Heard> = Map<string, Set<(heard: Heard) => void>>;

function listen<Heard>(to: Listeners<Heard>, tabId: string, listener: (heard: Heard) => void) {
  const set = to.get(tabId) ?? new Set();
  set.add(listener);
  to.set(tabId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) to.delete(tabId);
  };
}

const replaced: Listeners<void> = new Map();
const refusedReplacements: Listeners<PdfReplacementRefusalName> = new Map();

/**
 * A PDF tab's stored file as the room replaces it ("Replacing the stored file"): the room tells every editor of a
 * replacement, and the editor that asked for one of its refusal. The tab's open surface takes each.
 */
export const PdfStoredFiles = {
  /** Listen for the tab's stored file being replaced. */
  onReplaced: (tabId: string, listener: () => void): (() => void) =>
    listen(replaced, tabId, listener),
  replaced: (tabId: string): void => {
    for (const listener of [...(replaced.get(tabId) ?? [])]) listener();
  },
  /** Listen for the room refusing a replacement this editor asked for. */
  onRefused: (
    tabId: string,
    listener: (refusal: PdfReplacementRefusalName) => void,
  ): (() => void) => listen(refusedReplacements, tabId, listener),
  refused: (tabId: string, refusal: PdfReplacementRefusalName): void => {
    for (const listener of [...(refusedReplacements.get(tabId) ?? [])]) listener(refusal);
  },
} as const;
