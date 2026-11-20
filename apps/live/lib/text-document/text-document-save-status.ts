// Which save status a text document shows (docs/specs/034-text-documents/editing-surface.md "The title row"): from
// where it lives, whether its room is open, and what its binding reports.
import type { OfficeSaveStatus } from '@/components/office/office-save-status';

/** What a binding knows of its saving: an edit not yet safe, and whether saving has failed. */
export type SaveFacts = { readonly pending: boolean; readonly failed: boolean };

export function textDocumentSaveStatus({
  local,
  connected,
  pending,
  failed,
}: SaveFacts & { local: boolean; connected: boolean }): OfficeSaveStatus {
  if (failed) return 'failed';
  if (local) return pending ? 'saving' : 'this-browser';
  if (!connected) return 'offline';
  return pending ? 'saving' : 'saved';
}

/** A binding's save facts, read and watched by the surface. */
export type SaveFactsSource = {
  get: () => SaveFacts;
  subscribe: (listener: () => void) => () => void;
};

/** The facts a binding keeps: each change is told to its watchers, and logged. */
export function saveFactsStore(
  tabId: string,
  log: (message: string, data: object) => void,
): SaveFactsSource & { set: (next: Partial<SaveFacts>) => void } {
  let facts: SaveFacts = { pending: false, failed: false };
  const listeners = new Set<() => void>();
  return {
    get: () => facts,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      const merged = { ...facts, ...next };
      if (merged.pending === facts.pending && merged.failed === facts.failed) return;
      facts = merged;
      log('[text-document] save-facts', { tabId, ...facts });
      for (const listener of listeners) listener();
    },
  };
}
