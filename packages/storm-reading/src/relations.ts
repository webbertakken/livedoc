// The relations between notes (docs/specs/021-event-storming/board-reading.md "Relations"), found from geometry
// alone: each note takes at most one partner per relation, the nearest within reach that the notation allows.

import { ES_LANE_PITCH, type EventStormingNoteKind } from '@livedoc/document';
import { READING_REACH_LANES } from './constants';
import type { PlacedNote, StormRelations } from './types';

const ofKind = (notes: readonly PlacedNote[], ...kinds: EventStormingNoteKind[]) =>
  notes.filter((n) => kinds.includes(n.kind));

// Straight-line distance between centres, a lane apart costing one pitch: on-lane notes measure their real gap,
// and a note off its lane still measures by the lane it is nearest.
function distance(a: PlacedNote, b: PlacedNote): number {
  return Math.hypot(a.cx - b.cx, (a.lane - b.lane) * ES_LANE_PITCH);
}

// Ties: fewer lanes away, then the lane above, then document order.
const tieBreak = (from: PlacedNote, a: PlacedNote, b: PlacedNote) =>
  Math.abs(a.lane - from.lane) - Math.abs(b.lane - from.lane) ||
  a.lane - b.lane ||
  a.index - b.index;

const inReach = (a: PlacedNote, b: PlacedNote) => Math.abs(a.lane - b.lane) <= READING_REACH_LANES;

function overlap(a: PlacedNote, b: PlacedNote): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// The nearest candidate in reach that `allowed` keeps; ties go to the lane above, then to document order.
function nearest(
  from: PlacedNote,
  candidates: readonly PlacedNote[],
  allowed: (c: PlacedNote) => boolean,
): PlacedNote | null {
  let best: PlacedNote | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    if (c.id === from.id || !inReach(from, c) || !allowed(c)) continue;
    const d = distance(from, c);
    const better =
      d < bestDistance || (d === bestDistance && best !== null && tieBreak(from, c, best) < 0);
    if (better) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

// The candidate the note overlaps most; equal overlaps go to the first in document order.
function mostOverlapped(from: PlacedNote, candidates: readonly PlacedNote[]): PlacedNote | null {
  let best: PlacedNote | null = null;
  let bestArea = 0;
  for (const c of candidates) {
    const area = overlap(from, c);
    if (area > bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
}

// Not left of: the partner's centre is at or right of the note's left edge, so the same column counts.
const notLeftOf = (note: PlacedNote) => (c: PlacedNote) => c.cx >= note.left;
// Not right of: the partner's centre is at or left of the note's right edge.
const notRightOf = (note: PlacedNote) => (c: PlacedNote) => c.cx <= note.right;

export function relate(notes: readonly PlacedNote[]): StormRelations {
  const relations: StormRelations = {
    causes: {},
    triggers: {},
    issues: {},
    informs: {},
    decides: {},
    flags: {},
  };
  const events = ofKind(notes, 'domain-event');
  const commands = ofKind(notes, 'command');
  const byId = new Map(notes.map((n) => [n.id, n]));
  const link = (map: Record<string, string>, from: PlacedNote, to: PlacedNote | null) => {
    if (to) map[from.id] = to.id;
  };

  for (const command of commands)
    link(relations.causes, command, nearest(command, events, notLeftOf(command)));

  for (const policy of ofKind(notes, 'policy')) {
    const trigger = nearest(policy, events, notRightOf(policy));
    link(relations.triggers, policy, trigger);
    // A policy issues a command whose own event, if it has one, is not earlier than the policy's trigger.
    const issuesAfterTrigger = (c: PlacedNote) => {
      const caused = relations.causes[c.id];
      return !trigger || !caused || byId.get(caused)!.cx > trigger.cx;
    };
    link(
      relations.issues,
      policy,
      nearest(policy, commands, (c) => notLeftOf(policy)(c) && issuesAfterTrigger(c)),
    );
  }

  for (const actor of ofKind(notes, 'actor')) {
    link(
      relations.issues,
      actor,
      mostOverlapped(actor, commands) ?? nearest(actor, commands, notLeftOf(actor)),
    );
  }

  for (const readModel of ofKind(notes, 'read-model')) {
    link(relations.informs, readModel, nearest(readModel, commands, notLeftOf(readModel)));
  }

  for (const decider of ofKind(notes, 'aggregate', 'external-system')) {
    link(relations.decides, decider, nearest(decider, events, notLeftOf(decider)));
  }

  const flaggable = notes.filter((n) => n.kind !== 'hotspot');
  for (const hotspot of ofKind(notes, 'hotspot')) {
    link(
      relations.flags,
      hotspot,
      mostOverlapped(hotspot, flaggable) ?? nearest(hotspot, flaggable, () => true),
    );
  }

  return relations;
}
