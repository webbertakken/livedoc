// Show live edits (docs/specs/034-text-documents/tools.md "Accessibility settings", Show live edits): the words others
// add or remove as they write, read from the room's changes to the writing, one entry per author while they keep
// writing, newest first, the last LIVE_EDITS_MAX kept. Pure: what a change added and removed, and how entries join.
import * as Y from 'yjs';

/** How many entries the panel keeps (safe range 5..100; (default)). */
export const LIVE_EDITS_MAX = 20;
/** Edits by one author this close join one entry, read once it settles (safe range 500..10,000 ms; (default)). */
export const LIVE_EDIT_JOIN_MS = 2000;
/** How much of an entry's added or removed text is kept and read (safe range 40..1,000; (default)). */
export const LIVE_EDIT_TEXT_MAX = 200;

export type LiveEdit = {
  /** The sender's presence id. */
  readonly from: string;
  readonly name: string;
  readonly added: string;
  readonly removed: string;
  /** When its last change arrived (ms). */
  readonly at: number;
};

/** The text a change added and the text it removed, from the deep events of the writing it changed. */
export function editTextOf(events: readonly Y.YEvent<Y.AbstractType<unknown>>[]): {
  added: string;
  removed: string;
} {
  let added = '';
  let removed = '';
  for (const event of events) {
    if (!(event.target instanceof Y.XmlText)) continue;
    for (const op of event.delta) if (typeof op.insert === 'string') added += op.insert;
    // Walked by hand: a text's event names no deleted items in `changes.deleted`, but each still holds its text.
    for (let item = event.target._start; item; item = item.right)
      if (event.deletes(item))
        for (const part of item.content.getContent()) if (typeof part === 'string') removed += part;
  }
  return { added, removed };
}

const kept = (text: string): string =>
  text.length <= LIVE_EDIT_TEXT_MAX ? text : text.slice(text.length - LIVE_EDIT_TEXT_MAX);

export const LiveEdits = {
  /** The entries with this change in: joined to the newest where it is the same author's within the join time. */
  add: (
    entries: readonly LiveEdit[],
    change: { from: string; name: string; added: string; removed: string },
    now: number,
  ): readonly LiveEdit[] => {
    if (!change.added && !change.removed) return entries;
    const newest = entries[0];
    if (newest && newest.from === change.from && now - newest.at <= LIVE_EDIT_JOIN_MS)
      return [
        {
          ...newest,
          name: change.name,
          added: kept(newest.added + change.added),
          removed: kept(newest.removed + change.removed),
          at: now,
        },
        ...entries.slice(1),
      ];
    return [
      { ...change, added: kept(change.added), removed: kept(change.removed), at: now },
      ...entries,
    ].slice(0, LIVE_EDITS_MAX);
  },

  /** What is read for an entry: "Ada added “the plan”; removed “a”". */
  say: (entry: LiveEdit): string => {
    const parts: string[] = [];
    const added = entry.added.replace(/\s+/g, ' ').trim();
    const removed = entry.removed.replace(/\s+/g, ' ').trim();
    if (added) parts.push(`added “${added}”`);
    if (removed) parts.push(`removed “${removed}”`);
    if (parts.length === 0) parts.push('changed spacing');
    return `${entry.name} ${parts.join('; ')}`;
  },
} as const;
