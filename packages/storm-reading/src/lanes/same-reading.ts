// What a rearranged board would say differently (docs/specs/021-event-storming/lane-plans.md "What must stay true"):
// every relation the reading finds before must be found after, between the same two notes, and the timeline's events
// must keep their order. A relation the board gains is counted, never refused.

import type { ElementId, Tab } from '@livedoc/document';
import { readNotes } from '../notes';
import { relate } from '../relations';
import { byTime } from '../timeline';
import type { PlacedNote, StormRelations } from '../types';

export type ReadingRelation = keyof StormRelations;

// A relation lost (`now` null) or pointing at another note, or two events in another order: `from` now reads before
// `was`, which it followed.
export type ReadingChange =
  | { relation: ReadingRelation; from: ElementId; was: ElementId; now: ElementId | null }
  | { relation: 'order'; from: ElementId; was: ElementId; now: null };

export type ReadingDifference = {
  changes: ReadingChange[];
  // How many notes with no partner before find one.
  gained: number;
};

const RELATIONS: readonly ReadingRelation[] = [
  'causes',
  'triggers',
  'issues',
  'informs',
  'decides',
  'flags',
];

const eventsInOrder = (notes: readonly PlacedNote[]) =>
  notes
    .filter((n) => n.kind === 'domain-event')
    .sort(byTime)
    .map((n) => n.id);

export function readingChanges(
  before: Pick<Tab, 'elements'>,
  after: Pick<Tab, 'elements'>,
): ReadingDifference {
  const was = readNotes(before);
  const now = readNotes(after);
  const relationsWas = relate(was);
  const relationsNow = relate(now);
  const changes: ReadingChange[] = [];
  let gained = 0;

  const eventsWas = eventsInOrder(was);
  const eventsNow = eventsInOrder(now);
  // The first event that now reads earlier than the one that stood in its place.
  const moved = eventsNow.findIndex((id, i) => id !== eventsWas[i]);

  for (const note of [...was].sort(byTime)) {
    if (eventsNow[moved] === note.id)
      changes.push({ relation: 'order', from: note.id, was: eventsWas[moved]!, now: null });
    for (const relation of RELATIONS) {
      const partner = relationsWas[relation][note.id];
      const found = relationsNow[relation][note.id];
      if (partner === undefined) {
        if (found !== undefined) gained += 1;
      } else if (found !== partner) {
        changes.push({ relation, from: note.id, was: partner, now: found ?? null });
      }
    }
  }
  return { changes, gained };
}

const RELATION_WORDS: Readonly<Record<ReadingRelation, string>> = {
  causes: 'cause',
  triggers: 'be triggered by',
  issues: 'issue',
  informs: 'inform',
  decides: 'decide',
  flags: 'flag',
};

/** One change to what the board says, in words: "<subject> would no longer cause <partner> (now <partner>)".
 *  `subject` names the note the change is about, `partner` the others: an agent reads refs, a person the words. */
export function sayReadingChange(
  change: ReadingChange,
  subject: (id: ElementId) => string,
  partner: (id: ElementId) => string,
): string {
  if (change.relation === 'order')
    return `${subject(change.from)} would read before ${partner(change.was)}, which it follows`;
  const now = change.now === null ? '' : ` (now ${partner(change.now)})`;
  return `${subject(change.from)} would no longer ${RELATION_WORDS[change.relation]} ${partner(change.was)}${now}`;
}
