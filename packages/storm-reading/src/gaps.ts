// The gaps (docs/specs/021-event-storming/board-reading.md "Gaps"): findings about the board, each with a stable code,
// a level, the notes it is about and, where one note would close it, the remedy that becomes a suggestion.

import type { ElementId } from '@livedoc/document';
import { TENSE_CHECK_MIN_SHARE } from './constants';
import { firstWord, lastWord, readsAsPastTense } from './tense';
import {
  GAP_CODES,
  type GapCode,
  type GapLevel,
  type GapRemedy,
  type PlacedNote,
  type StormGap,
  type StormRelations,
} from './types';
import type { Timeline } from './timeline';

const LEVEL: Record<GapCode, GapLevel> = {
  event_without_cause: 'flow',
  command_without_event: 'flow',
  command_without_trigger: 'flow',
  policy_without_trigger: 'flow',
  policy_without_command: 'flow',
  read_model_unused: 'flow',
  blank_note: 'notation',
  event_not_past_tense: 'notation',
  command_not_imperative: 'notation',
  duplicate_note: 'question',
  open_hotspot: 'question',
};

// The kinds that name a moment; the others (actors, read models, aggregates, external systems) recur by nature.
const MOMENT_KINDS: readonly PlacedNote['kind'][] = ['domain-event', 'command', 'policy'];

const quoted = (n: PlacedNote) =>
  n.words ? `"${n.words}"` : `a blank ${n.kind.replace('-', ' ')}`;

// Words compared for duplicates: case, punctuation and repeated spaces ignored.
const comparable = (words: string) =>
  words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

export function findGaps(
  notes: readonly PlacedNote[],
  relations: StormRelations,
  timeline: Timeline,
): StormGap[] {
  const gaps: StormGap[] = [];
  const add = (
    code: GapCode,
    subjects: PlacedNote[],
    message: string,
    remedy: GapRemedy | null = null,
  ) => gaps.push({ code, level: LEVEL[code], ids: subjects.map((n) => n.id), message, remedy });
  const values = (map: Record<ElementId, ElementId>) => new Set(Object.values(map));
  const caused = values(relations.causes);
  const issued = values(relations.issues);
  const of = (kind: PlacedNote['kind']) => notes.filter((n) => n.kind === kind);
  const externalCauses = new Set(
    of('external-system')
      .map((n) => relations.decides[n.id])
      .filter((id) => id !== undefined),
  );

  for (const event of of('domain-event')) {
    if (!caused.has(event.id) && !externalCauses.has(event.id))
      add(
        'event_without_cause',
        [event],
        `${quoted(event)}: nothing on the board makes it happen`,
        {
          kind: 'command',
          side: 'before',
          anchor: event.id,
        },
      );
  }
  for (const command of of('command')) {
    if (!relations.causes[command.id])
      add('command_without_event', [command], `${quoted(command)}: no event follows from it`, {
        kind: 'domain-event',
        side: 'after',
        anchor: command.id,
      });
    if (!issued.has(command.id))
      add(
        'command_without_trigger',
        [command],
        `${quoted(command)}: no actor or policy issues it`,
        {
          kind: 'actor',
          side: 'above',
          anchor: command.id,
        },
      );
  }
  for (const policy of of('policy')) {
    if (!relations.triggers[policy.id])
      add('policy_without_trigger', [policy], `${quoted(policy)}: no event triggers it`, {
        kind: 'domain-event',
        side: 'before',
        anchor: policy.id,
      });
    if (!relations.issues[policy.id])
      add('policy_without_command', [policy], `${quoted(policy)}: it issues no command`, {
        kind: 'command',
        side: 'after',
        anchor: policy.id,
      });
  }
  for (const readModel of of('read-model')) {
    if (!relations.informs[readModel.id])
      add('read_model_unused', [readModel], `${quoted(readModel)}: no command is decided with it`, {
        kind: 'command',
        side: 'after',
        anchor: readModel.id,
      });
  }

  for (const note of notes)
    if (!note.words) add('blank_note', [note], `${quoted(note)} has no words`);

  const wordedEvents = of('domain-event').filter((n) => n.words);
  const pastShare =
    wordedEvents.filter((n) => readsAsPastTense(lastWord(n.words))).length /
    (wordedEvents.length || 1);
  if (wordedEvents.length > 0 && pastShare >= TENSE_CHECK_MIN_SHARE) {
    for (const event of wordedEvents)
      if (!readsAsPastTense(lastWord(event.words)))
        add(
          'event_not_past_tense',
          [event],
          `${quoted(event)}: an event reads as something that happened`,
        );
    for (const command of of('command').filter((n) => n.words))
      if (readsAsPastTense(firstWord(command.words)))
        add(
          'command_not_imperative',
          [command],
          `${quoted(command)}: a command reads as an intent, not a fact`,
        );
  }

  const groups = new Map<string, PlacedNote[]>();
  for (const note of notes.filter((n) => MOMENT_KINDS.includes(n.kind))) {
    const key = comparable(note.words);
    if (!key) continue;
    const id = `${note.kind}\u0000${key}`;
    groups.set(id, [...(groups.get(id) ?? []), note]);
  }
  for (const group of groups.values())
    if (group.length > 1)
      add(
        'duplicate_note',
        group,
        `${quoted(group[0]!)} appears ${group.length} times as a ${group[0]!.kind.replace('-', ' ')}`,
      );

  for (const hotspot of of('hotspot'))
    add('open_hotspot', [hotspot], `${quoted(hotspot)} is still open`);

  const position = new Map(timeline.order.map((id, i) => [id, i]));
  const codeRank = (code: GapCode) => GAP_CODES.indexOf(code);
  return gaps.sort(
    (a, b) =>
      position.get(a.ids[0]!)! - position.get(b.ids[0]!)! || codeRank(a.code) - codeRank(b.code),
  );
}
