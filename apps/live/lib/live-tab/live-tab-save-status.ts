// Which save status a live tab kind's title row shows (docs/specs/006-document/kinds-outside-the-canvas.md "Live
// state"; docs/specs/034-text-documents/editing-surface.md "The title row"): from where the document lives, whether
// its room is open, and what its binding reports. Each kind logs under its own tag.
import type {
  OfficeSaveStatus,
  OfficeSaveStatusSource,
} from '@/components/office/office-save-status';

/** What a binding knows of its saving: an edit not yet safe, and whether saving has failed. */
export type SaveFacts = { readonly pending: boolean; readonly failed: boolean };

export function liveTabSaveStatus({
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
export function liveTabSaveFacts(
  tag: string,
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
      log(`${tag} save-facts`, { tabId, ...facts });
      for (const listener of listeners) listener();
    },
  };
}

/** Whether the room is open, read and watched. */
export type ConnectionSource = {
  get: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

/**
 * The status the title row shows, read and watched where it is drawn: the surface never draws again for it, so a
 * keystroke's Saving and Saved redraw the status alone (performance.md "Budgets"). Each status it changes to is logged.
 */
export function liveTabSaveStatusSource(
  tag: string,
  facts: SaveFactsSource,
  local: boolean,
  connection: ConnectionSource,
  log: (message: string, data: object) => void,
): OfficeSaveStatusSource {
  const get = () => liveTabSaveStatus({ ...facts.get(), local, connected: connection.get() });
  let said = get();
  return {
    get,
    subscribe: (listener) => {
      const changed = () => {
        const status = get();
        if (status !== said) {
          said = status;
          log(`${tag} save-status`, { status });
        }
        listener();
      };
      const stopFacts = facts.subscribe(changed);
      const stopConnection = connection.subscribe(changed);
      return () => {
        stopFacts();
        stopConnection();
      };
    },
  };
}
