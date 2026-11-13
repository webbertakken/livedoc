// The board reading (docs/specs/021-event-storming/board-reading.md): what an Event Storming board says, read from
// where its notes sit. Deterministic and pure; no model is involved.

import type { Tab } from '@livedoc/document';
import { readContexts } from './contexts';
import { findGaps } from './gaps';
import { readNotes } from './notes';
import { relate } from './relations';
import { buildTimeline } from './timeline';
import { STORM_SCHEMA, type StormReading } from './types';

export function readBoard(
  tab: Pick<Tab, 'id' | 'name' | 'elements'>,
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
    gaps: findGaps(placed, relations, timeline),
    contexts: readContexts(tab, order),
  };
}
