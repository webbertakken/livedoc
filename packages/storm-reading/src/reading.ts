// The board reading (docs/specs/021-event-storming/board-reading.md): what an Event Storming board says, read from
// where its notes sit. Deterministic and pure; no model is involved.

import { aboutOf, type Tab } from '@livedoc/document';
import { readContextMap } from './context-map';
import { readContexts } from './contexts';
import { findGaps } from './gaps';
import { readNotes } from './notes';
import { relate } from './relations';
import { readDecisions, readLanes, readPhases } from './structure';
import { buildTimeline } from './timeline';
import { STORM_SCHEMA, type StormReading } from './types';

export function readBoard(
  tab: Pick<Tab, 'id' | 'name' | 'elements' | 'esAbout'>,
  context: { documentId?: string } = {},
): StormReading {
  const placed = readNotes(tab);
  const relations = relate(placed);
  const timeline = buildTimeline(placed, relations);
  const order = new Map(timeline.order.map((id, i) => [id, i]));
  const notes = placed
    .map(({ id, ref, kind, words, lane }) => ({
      id,
      ref,
      kind,
      words,
      lane,
      order: order.get(id)!,
    }))
    .sort((a, b) => a.order - b.order);
  const contexts = readContexts(tab, order);
  const ordered = [...placed].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const pivotal = timeline.moments
    .map((m) => m.event)
    .filter((id) => placed.find((n) => n.id === id)!.pivotal);
  const about = aboutOf(tab);
  return {
    schema: STORM_SCHEMA,
    board: {
      tabId: tab.id,
      name: tab.name,
      ...(context.documentId ? { documentId: context.documentId } : {}),
    },
    notes,
    relations,
    timeline: timeline.moments,
    chains: timeline.chains,
    loose: timeline.loose,
    gaps: findGaps(placed, relations, timeline, contexts),
    contexts,
    ...(about ? { about } : {}),
    lanes: readLanes(tab, placed),
    pivotal,
    phases: readPhases(timeline.moments, new Set(pivotal)),
    decisions: readDecisions(ordered, relations),
    contextMap: readContextMap(notes, relations, contexts),
  };
}
