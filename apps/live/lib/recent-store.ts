import { debugLog } from '@/lib/debug-log';

// A small store in this browser's localStorage that remembers a value per key, the most recent `max` kept and the
// oldest forgotten first. A value that no longer parses is forgotten, never handed back. Used for what a person
// leaves behind per document (a surface's view, a text document's zoom).

type Entry = [key: string, value: unknown];

export type RecentStore<T> = {
  read: (key: string) => T | null;
  write: (key: string, value: T) => void;
};

export function recentStore<T>(
  storageKey: string,
  max: number,
  parse: (value: unknown) => T | null,
): RecentStore<T> {
  const readEntries = (): Entry[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is Entry => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string',
      );
    } catch {
      return [];
    }
  };
  const writeEntries = (entries: Entry[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch (error) {
      // A full or blocked storage forgets; whoever reads starts from their default.
      debugLog(`[recent-store] write failed key=${storageKey} ${String(error)}`);
    }
  };
  return {
    read: (key) => {
      const entries = readEntries();
      const found = entries.find(([k]) => k === key);
      if (!found) return null;
      const value = parse(found[1]);
      if (value === null) {
        debugLog(`[recent-store] forgot reason=unparsable key=${storageKey}`);
        writeEntries(entries.filter(([k]) => k !== key));
      }
      return value;
    },
    write: (key, value) => {
      const rest = readEntries().filter(([k]) => k !== key);
      writeEntries([...rest, [key, value] as Entry].slice(-max));
    },
  };
}
