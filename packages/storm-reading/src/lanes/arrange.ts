// Arrange and Reorder (docs/specs/021-event-storming/arrange.md): the board laid out afresh along the timeline, a
// column per event, every note in the column of the event it belongs to and on the lane it stands on. It is the
// board's own act, worked out from the reading; the result must say what the board says. Pure and repeatable.

import {
  ES_NOTE_GAP,
  plannableNotes,
  type Element,
  type ElementId,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { ARRANGE_COLUMN_GAP, ARRANGE_COLUMN_GAP_MAX, ARRANGE_COLUMN_GAP_STEP } from '../constants';
import { readNotes } from '../notes';
import { relate } from '../relations';
import { buildTimeline, byTime } from '../timeline';
import type { PlacedNote, StormRelations } from '../types';
import { blockedBy, type Box } from './blocked';
import { readingChanges, type ReadingChange } from './same-reading';

export type Arranged =
  // `elements`: the board with its notes where they would stand; `gap`: how far apart its columns stand.
  | { ok: true; elements: Element[]; gap: number; gained: number }
  // `no_events`: nothing to follow. `already`: no note would move.
  | { ok: false; why: 'no_events' | 'already' }
  | { ok: false; why: 'blocked'; blocked: ElementId[] }
  | { ok: false; why: 'reading_changes'; changes: ReadingChange[] };

// The note a note leads to or follows: what ties it to an event's column.
function partnerOf(note: PlacedNote, relations: StormRelations): ElementId | undefined {
  switch (note.kind) {
    case 'domain-event':
      return undefined;
    case 'command':
      return relations.causes[note.id];
    case 'policy':
      return relations.triggers[note.id];
    case 'actor':
      return relations.issues[note.id];
    case 'read-model':
      return relations.informs[note.id];
    case 'aggregate':
    case 'external-system':
      return relations.decides[note.id];
    case 'hotspot':
      return relations.flags[note.id];
  }
}

// A column: its notes in the reading's order, each with its left edge from the column's own left, and its width.
type Column = { notes: { note: PlacedNote; left: number }[]; width: number };

// Centres never step back along the reading's order, so what leads to a note is never right of it; on one lane the
// notes stand a gutter apart. A column of notes each on its own lane shares one centre.
function layOut(members: readonly PlacedNote[]): Column {
  const reached = new Map<number, number>();
  let centre = 0;
  const lefts = members.map((note) => {
    const width = note.right - note.left;
    centre = Math.max(centre, (reached.get(note.lane) ?? -Infinity) + ES_NOTE_GAP + width / 2);
    reached.set(note.lane, centre + width / 2);
    return centre - width / 2;
  });
  const start = Math.min(...lefts);
  return {
    notes: members.map((note, i) => ({ note, left: lefts[i]! - start })),
    width: Math.max(...reached.values()) - start,
  };
}

export function arrangeBoard(tab: Pick<Tab, 'elements' | 'layers'>): Arranged {
  const read = readNotes(tab);
  const relations = relate(read);
  const order = new Map(buildTimeline(read, relations).order.map((id, i) => [id, i]));
  const byId = new Map(read.map((n) => [n.id, n]));
  const movable = new Set(plannableNotes(tab).map((n) => n.id));
  const moving = read.filter((n) => movable.has(n.id));
  const events = moving.filter((n) => n.kind === 'domain-event').sort(byTime);
  if (events.length === 0) return { ok: false, why: 'no_events' };

  // A note's column is headed by the event its relations lead to, or by the last note of that walk when it ends
  // short of an event that moves: a loose note heads a column of its own.
  const headOf = (note: PlacedNote): PlacedNote => {
    const partner = byId.get(partnerOf(note, relations) ?? '');
    return partner && movable.has(partner.id) ? headOf(partner) : note;
  };
  const members = new Map<ElementId, PlacedNote[]>();
  for (const note of [...moving].sort((a, b) => order.get(a.id)! - order.get(b.id)!)) {
    const head = headOf(note).id;
    members.set(head, [...(members.get(head) ?? []), note]);
  }
  // A loose column stands after the last event whose centre is left of its own.
  const loose = moving.filter((n) => members.has(n.id) && n.kind !== 'domain-event').sort(byTime);
  const heads = events.flatMap((event, i) => [
    ...loose.filter((n) => events.filter((e) => e.cx < n.cx).length === i),
    event,
  ]);
  heads.push(...loose.filter((n) => events.every((e) => e.cx < n.cx)));
  const columns = heads.map((head) => layOut(members.get(head.id)!));

  const wallLeft = Math.min(...moving.map((n) => n.left));
  for (let gap = ARRANGE_COLUMN_GAP; ; gap += ARRANGE_COLUMN_GAP_STEP) {
    const spacing = Math.min(gap, ARRANGE_COLUMN_GAP_MAX);
    const placed = new Map<ElementId, Box>();
    const elements = [...tab.elements];
    let left = wallLeft;
    for (const column of columns) {
      for (const { note, left: within } of column.notes) {
        const x = left + within;
        placed.set(note.id, {
          x,
          y: note.top,
          width: note.right - note.left,
          height: note.bottom - note.top,
        });
        if (x !== note.left)
          elements[note.index] = { ...(elements[note.index] as StickyElement), x };
      }
      left += column.width + spacing;
    }
    const blocked = blockedBy(read, placed);
    const { changes, gained } = readingChanges(tab, { elements });
    if (blocked.length === 0 && changes.length === 0) {
      const moved = elements.some((el, i) => el !== tab.elements[i]);
      return moved ? { ok: true, elements, gap: spacing, gained } : { ok: false, why: 'already' };
    }
    // No spacing keeps it: what the widest would change, or the note in its way.
    if (spacing === ARRANGE_COLUMN_GAP_MAX)
      return blocked.length > 0
        ? { ok: false, why: 'blocked', blocked }
        : { ok: false, why: 'reading_changes', changes };
  }
}
