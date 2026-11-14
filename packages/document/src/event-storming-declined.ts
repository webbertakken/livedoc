// What was declined on an event-storming board (docs/specs/021-event-storming/asks.md "What was declined"):
// dismissing a suggestion is a decision, so the board remembers it (`Tab.esDeclined`) and the same suggestion is
// refused when made again. A person's editor writes the list; agents only read it. Pure: every write answers the tab
// after it, the same tab when nothing changes.

import type { CandidateContextElement } from './candidate-contexts';
import { EVENT_STORMING_NOTES, type EventStormingNoteKind } from './event-storming';
import { suggestionRootId } from './event-storming-suggestions';
import { comparableWords } from './event-storming-words';
import type { EsNoteChange } from './note-changes';
import type { Element, ElementId, StickyElement } from './index';

/** The most entries a board keeps; past it the oldest go (safe range: 50 to 500). */
export const DECLINED_MAX = 200;
/** The most subjects one entry names: the first of a larger set, in id order (safe range: 10 to 100). */
export const DECLINED_ABOUT_MAX = 40;
/** The longest words one entry keeps, characters (safe range: 100 to 1000). */
export const DECLINED_WORDS_MAX = 400;

/** What was declined: a suggested note, a suggested context, a name for contexts, or a change to a note. */
export const DECLINED_TYPES = [
  'note',
  'context',
  'name',
  'reword',
  'kind',
  'split',
  'remove',
] as const;
export type DeclinedType = (typeof DECLINED_TYPES)[number];

export type EsDeclined = {
  type: DeclinedType;
  /** Its words or name; a split's parts joined by " | ". */
  words?: string;
  /** Its kind, where it has one: a suggested note's, or the kind a change proposed. */
  kind?: EventStormingNoteKind;
  /** The notes or contexts it was about, in id order. */
  about: ElementId[];
};

type Declining = { esDeclined?: unknown };

const cleanWords = (words: string) =>
  words.replace(/\s+/g, ' ').trim().slice(0, DECLINED_WORDS_MAX).trim();

const subjects = (ids: readonly ElementId[]) =>
  [...new Set(ids)].sort().slice(0, DECLINED_ABOUT_MAX);

export function isValidEsDeclined(v: unknown): v is EsDeclined {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    DECLINED_TYPES.some((type) => type === d.type) &&
    (d.words === undefined ||
      (typeof d.words === 'string' && d.words.length <= DECLINED_WORDS_MAX)) &&
    (d.kind === undefined || EVENT_STORMING_NOTES.some((n) => n.kind === d.kind)) &&
    Array.isArray(d.about) &&
    d.about.length > 0 &&
    d.about.length <= DECLINED_ABOUT_MAX &&
    d.about.every((id) => typeof id === 'string' && id.length > 0)
  );
}

/** What the board remembers as declined, oldest first: the newest DECLINED_MAX entries, anything else left out. */
export function declinedOf(tab: Declining): EsDeclined[] {
  if (!Array.isArray(tab.esDeclined)) return [];
  return tab.esDeclined.filter(isValidEsDeclined).slice(-DECLINED_MAX);
}

// An entry's words as they compare; a split's part by part, so two splits of the same words at another place differ.
function wordsKey(d: EsDeclined): string {
  const words = d.words ?? '';
  return d.type === 'split'
    ? words.split('|').map(comparableWords).join('|')
    : comparableWords(words);
}

// Two entries that name the same suggestion: type, words (as they compare), kind and subjects.
function sameDeclined(a: EsDeclined, b: EsDeclined): boolean {
  const [as, bs] = [subjects(a.about), subjects(b.about)];
  return (
    a.type === b.type &&
    a.kind === b.kind &&
    wordsKey(a) === wordsKey(b) &&
    as.length === bs.length &&
    as.every((id, i) => id === bs[i])
  );
}

/** Whether a suggestion like `entry` was declined before. */
export function isDeclined(tab: Declining, entry: EsDeclined): boolean {
  return declinedOf(tab).some((d) => sameDeclined(d, entry));
}

/** The tab remembering `entries` as declined, each once, the oldest dropped past DECLINED_MAX. */
export function withDeclined<T extends Declining>(
  tab: T,
  entries: readonly EsDeclined[],
): T & { esDeclined?: EsDeclined[] } {
  const held = declinedOf(tab);
  const next = [...held];
  for (const entry of entries)
    if (isValidEsDeclined(entry) && !next.some((d) => sameDeclined(d, entry))) next.push(entry);
  if (next.length === held.length) return tab as T & { esDeclined?: EsDeclined[] };
  return { ...tab, esDeclined: next.slice(-DECLINED_MAX) };
}

/** The tab with nothing remembered as declined: Forget Declined. */
export function withoutDeclined<T extends Declining>(tab: T): T {
  if (tab.esDeclined === undefined) return tab;
  const { esDeclined: _dropped, ...rest } = tab;
  return rest as T;
}

/** A dismissed suggested note: about the note its chain grows from, so the chain suggested again is refused. */
export function declinedNote(elements: readonly Element[], suggestion: StickyElement): EsDeclined {
  return {
    type: 'note',
    words: cleanWords(suggestion.label ?? ''),
    ...(suggestion.esKind ? { kind: suggestion.esKind } : {}),
    about: [suggestionRootId(elements, suggestion.id)],
  };
}

/** A dismissed suggested context: about its notes. */
export function declinedContext(context: CandidateContextElement): EsDeclined {
  return {
    type: 'context',
    words: cleanWords(context.label),
    about: subjects(context.esContext.notes),
  };
}

/** A dismissed name suggestion: about the contexts it was for. */
export function declinedName(contextIds: readonly ElementId[], name: string): EsDeclined {
  return { type: 'name', words: cleanWords(name), about: subjects(contextIds) };
}

/** A dismissed note change: about its note. */
export function declinedChange(noteId: ElementId, change: EsNoteChange): EsDeclined {
  const about = [noteId];
  switch (change.change) {
    case 'reword':
      return { type: 'reword', words: cleanWords(change.words), about };
    case 'kind':
      return { type: 'kind', kind: change.kind, about };
    case 'split':
      return { type: 'split', words: cleanWords(change.parts.join(' | ')), about };
    case 'remove':
      return { type: 'remove', about };
  }
}
