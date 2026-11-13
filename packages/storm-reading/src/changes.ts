// What changed on a board between two readings (docs/specs/021-event-storming/domain-export.md "Iterative, never from
// scratch"): notes added, removed, reworded and re-kinded, and relations made and broken, all by stable note id, so a
// reworded note is a rewording and never a removal plus an addition.

import type { ElementId } from '@livedoc/document';
import type { StormContext, StormNote, StormReading, StormRelations } from './types';

export type RelationName = keyof StormRelations;

export type StormChanges = {
  added: StormNote[];
  removed: StormNote[];
  reworded: { note: StormNote; was: string }[];
  rekinded: { note: StormNote; was: StormNote['kind'] }[];
  related: { relation: RelationName; from: ElementId; to: ElementId }[];
  unrelated: { relation: RelationName; from: ElementId; to: ElementId }[];
  // Candidate contexts (docs/specs/021-event-storming/candidate-contexts.md "In the reading and the export"): added,
  // removed and renamed, and the notes that joined or left one both readings hold.
  contextsAdded: StormContext[];
  contextsRemoved: StormContext[];
  contextsRenamed: { context: StormContext; was: string }[];
  joined: { note: ElementId; context: StormContext }[];
  left: { note: ElementId; context: StormContext }[];
};

const RELATIONS: readonly RelationName[] = [
  'causes',
  'triggers',
  'issues',
  'informs',
  'decides',
  'flags',
];

export function diffReadings(previous: StormReading, next: StormReading): StormChanges {
  const before = new Map(previous.notes.map((n) => [n.id, n]));
  const after = new Map(next.notes.map((n) => [n.id, n]));
  const pairs = (r: StormRelations, relation: RelationName) =>
    new Set(Object.entries(r[relation]).map(([from, to]) => `${from}\u0000${to}`));
  const split = (key: string, relation: RelationName) => {
    const [from, to] = key.split('\u0000') as [string, string];
    return { relation, from, to };
  };
  const changes: StormChanges = {
    added: [],
    removed: [],
    reworded: [],
    rekinded: [],
    related: [],
    unrelated: [],
    contextsAdded: [],
    contextsRemoved: [],
    contextsRenamed: [],
    joined: [],
    left: [],
  };
  for (const note of next.notes) {
    const was = before.get(note.id);
    if (!was) changes.added.push(note);
    else {
      if (was.words !== note.words) changes.reworded.push({ note, was: was.words });
      if (was.kind !== note.kind) changes.rekinded.push({ note, was: was.kind });
    }
  }
  for (const note of previous.notes) if (!after.has(note.id)) changes.removed.push(note);
  for (const relation of RELATIONS) {
    const old = pairs(previous.relations, relation);
    const now = pairs(next.relations, relation);
    for (const key of now) if (!old.has(key)) changes.related.push(split(key, relation));
    for (const key of old) if (!now.has(key)) changes.unrelated.push(split(key, relation));
  }
  diffContexts(previous.contexts, next.contexts, changes);
  return changes;
}

export function hasChanges(c: StormChanges): boolean {
  return Object.values(c).some((list) => list.length > 0);
}

const VERB: Record<RelationName, string> = {
  causes: 'causes',
  triggers: 'is triggered by',
  issues: 'issues',
  informs: 'informs',
  decides: 'decides',
  flags: 'flags',
};

// CHANGES.md: one line per change, by note id, with the words as they read now (and as they read before).
export function formatChanges(
  changes: StormChanges,
  previous: StormReading,
  next: StormReading,
): string {
  const words = new Map(
    [...previous.notes, ...next.notes].map((n) => [n.id, `${n.kind} ${n.id} "${n.words}"`]),
  );
  // Every id a change names is a note of one reading or the other.
  const say = (id: ElementId) => words.get(id)!;
  const section = (title: string, lines: string[]) =>
    lines.length ? [`## ${title}`, '', ...lines, ''] : [];
  const contextName = (c: StormContext) => `context ${c.id} "${c.name}"`;
  const relationLine = (r: StormChanges['related'][number]) =>
    `- ${say(r.from)} ${VERB[r.relation]} ${say(r.to)}`;
  const body = [
    ...section(
      'Added',
      changes.added.map((n) => `- ${say(n.id)}`),
    ),
    ...section(
      'Removed',
      changes.removed.map((n) => `- ${say(n.id)}`),
    ),
    ...section(
      'Reworded',
      changes.reworded.map((r) => `- ${say(r.note.id)}, was "${r.was}"`),
    ),
    ...section(
      'Re-kinded',
      changes.rekinded.map((r) => `- ${say(r.note.id)}, was a ${r.was}`),
    ),
    ...section('Related', changes.related.map(relationLine)),
    ...section('No longer related', changes.unrelated.map(relationLine)),
    ...section(
      'Contexts added',
      changes.contextsAdded.map((c) => `- ${contextName(c)}: ${c.notes.map(say).join(', ')}`),
    ),
    ...section(
      'Contexts removed',
      changes.contextsRemoved.map((c) => `- ${contextName(c)}`),
    ),
    ...section(
      'Contexts renamed',
      changes.contextsRenamed.map((r) => `- ${contextName(r.context)}, was "${r.was}"`),
    ),
    ...section(
      'Joined a context',
      changes.joined.map((j) => `- ${say(j.note)} joined ${contextName(j.context)}`),
    ),
    ...section(
      'Left a context',
      changes.left.map((l) => `- ${say(l.note)} left ${contextName(l.context)}`),
    ),
  ];
  return [
    '# Changes since the last export',
    '',
    hasChanges(changes)
      ? 'Change only what these imply; leave everything else as it is.'
      : 'Nothing changed on the board.',
    '',
    ...body,
  ].join('\n');
}

function diffContexts(
  previous: readonly StormContext[],
  next: readonly StormContext[],
  changes: StormChanges,
): void {
  const before = new Map(previous.map((c) => [c.id, c]));
  const after = new Set(next.map((c) => c.id));
  for (const context of next) {
    const was = before.get(context.id);
    if (!was) {
      changes.contextsAdded.push(context);
      continue;
    }
    if (was.name !== context.name) changes.contextsRenamed.push({ context, was: was.name });
    for (const note of context.notes)
      if (!was.notes.includes(note)) changes.joined.push({ note, context });
    for (const note of was.notes)
      if (!context.notes.includes(note)) changes.left.push({ note, context });
  }
  for (const context of previous) if (!after.has(context.id)) changes.contextsRemoved.push(context);
}
