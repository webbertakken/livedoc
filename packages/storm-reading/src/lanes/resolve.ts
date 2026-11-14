// Which notes each line of a lane plan takes (docs/specs/021-event-storming/lane-plans.md "How an agent suggests
// one"). A line says what its lane holds four ways, which may be mixed: notes by id, the notes of a candidate
// context, the notes of a kind, and the notes now on a lane. The most specific line takes a note; between two as
// specific, the first.

import {
  candidateContexts,
  LANES_MAX,
  LANES_MIN,
  plannableNotes,
  type ElementId,
  type EsPlanLane,
  type EventStormingNoteKind,
  type Tab,
} from '@livedoc/document';
import { readNotes } from '../notes';
import { readLanes } from '../structure';
import { byTime } from '../timeline';

export type LaneLine = {
  name: string;
  // Lanes by the number the reading prints for them.
  lanes?: readonly number[];
  kinds?: readonly EventStormingNoteKind[];
  contexts?: readonly ElementId[];
  notes?: readonly ElementId[];
};

// `line` counts from 0, in the order the lines were given.
export type LaneRefusal =
  | { code: 'lanes_out_of_range'; count: number }
  | { code: 'lane_not_found'; line: number; lane: number; lanes: number }
  | { code: 'lane_blocked'; line: number; note: ElementId }
  | { code: 'lane_empty'; line: number }
  | { code: 'lanes_incomplete'; notes: ElementId[] };

export type ResolvedLanes = { lanes: EsPlanLane[] } | { refusal: LaneRefusal };

// How specifically a line names a note; 0 when it does not.
const BY_ID = 4;
const BY_CONTEXT = 3;
const BY_KIND = 2;
const BY_LANE = 1;

export function resolveLaneLines(
  tab: Pick<Tab, 'elements' | 'layers'>,
  lines: readonly LaneLine[],
): ResolvedLanes {
  if (lines.length < LANES_MIN || lines.length > LANES_MAX)
    return { refusal: { code: 'lanes_out_of_range', count: lines.length } };

  const read = readNotes(tab);
  const numbered = readLanes(tab, read);
  const laneOfNumber = new Map(numbered.map((lane) => [lane.number, lane.lane]));
  const plannable = new Set(plannableNotes(tab).map((n) => n.id));
  const notesOfContext = new Map(
    candidateContexts(tab.elements).map((c) => [c.id, new Set(c.esContext.notes)]),
  );

  for (const [line, { lanes = [], notes = [] }] of lines.entries()) {
    const unknown = lanes.find((n) => !laneOfNumber.has(n));
    if (unknown !== undefined)
      return {
        refusal: { code: 'lane_not_found', line, lane: unknown, lanes: numbered.length },
      };
    const stays = notes.find((id) => !plannable.has(id));
    if (stays !== undefined) return { refusal: { code: 'lane_blocked', line, note: stays } };
  }

  const taken: ElementId[][] = lines.map(() => []);
  const left: ElementId[] = [];
  for (const note of read.filter((n) => plannable.has(n.id)).sort(byTime)) {
    let best = -1;
    let bestScore = 0;
    for (const [line, { lanes = [], kinds = [], contexts = [], notes = [] }] of lines.entries()) {
      const score = notes.includes(note.id)
        ? BY_ID
        : contexts.some((id) => notesOfContext.get(id)?.has(note.id))
          ? BY_CONTEXT
          : kinds.includes(note.kind)
            ? BY_KIND
            : lanes.some((n) => laneOfNumber.get(n) === note.lane)
              ? BY_LANE
              : 0;
      if (score > bestScore) {
        best = line;
        bestScore = score;
      }
    }
    if (best < 0) left.push(note.id);
    else taken[best]!.push(note.id);
  }

  const empty = taken.findIndex((notes) => notes.length === 0);
  if (empty >= 0) return { refusal: { code: 'lane_empty', line: empty } };
  if (left.length > 0) return { refusal: { code: 'lanes_incomplete', notes: left } };
  return { lanes: lines.map((line, i) => ({ name: line.name, notes: taken[i]! })) };
}
