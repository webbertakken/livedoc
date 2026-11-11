// The notes a board reading reads (docs/specs/021-event-storming/board-reading.md "What is read"): every workshop
// note, by its kind, words, lane and box. A suggestion has no notation kind, so it is never read.

import {
  computeRefs,
  ES_LANES,
  eventStormingKindOf,
  laneIndexAt,
  type Tab,
} from '@livedoc/document';
import type { PlacedNote } from './types';

// A note's words: trimmed, whitespace runs collapsed, the typed case kept.
export function wordsOf(label: string | undefined): string {
  return (label ?? '').replace(/\s+/g, ' ').trim();
}

export function readNotes(tab: Pick<Tab, 'elements'>): PlacedNote[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const notes: PlacedNote[] = [];
  tab.elements.forEach((el, index) => {
    if (el.type !== 'sticky') return;
    const kind = eventStormingKindOf(el);
    if (!kind) return;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    notes.push({
      id: el.id,
      ref: refs.refOf(el.id),
      kind,
      words: wordsOf(el.label),
      lane: laneIndexAt(cy, ES_LANES),
      index,
      cx,
      cy,
      left: el.x,
      right: el.x + el.width,
      top: el.y,
      bottom: el.y + el.height,
    });
  });
  return notes;
}
