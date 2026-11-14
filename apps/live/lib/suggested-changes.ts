import {
  candidateContexts,
  contextBounds,
  contextNotes,
  eventStormingKindOf,
  nameSuggestionsFor,
  noteChangesOf,
  rewordRipple,
  type CandidateContextElement,
  type Element,
  type ElementId,
  type EsNameSuggestion,
  type EsNoteChange,
  type EventStormingNoteKind,
  type Rect,
  type StickyElement,
} from '@livedoc/document';

// A board's suggested changes as the canvas draws them (docs/specs/021-event-storming/suggested-changes.md "How a
// person sees and decides"): the notes that wear a change mark, and the panel's rows for note changes, a context's
// names and a merge's names. Pure: derived from the board as it stands, never stored.

/** A note that wears a change mark: the changes suggested on it, the first being what the mark previews. */
export type ChangeMark = {
  note: StickyElement;
  kind: EventStormingNoteKind;
  changes: EsNoteChange[];
};

/** One suggested change of one note. `index` is its place among the note's changes. */
export type ChangeRow = {
  type: 'change';
  note: StickyElement;
  kind: EventStormingNoteKind;
  change: EsNoteChange;
  index: number;
  bounds: Rect;
  // How many notes hold a reword's term beyond its context: what Everywhere would also reword.
  beyond: number;
};

/** The names suggested for one context. */
export type NamesRow = {
  type: 'names';
  context: CandidateContextElement;
  names: EsNameSuggestion[];
  bounds: Rect;
};

/** The names suggested for several contexts merged. */
export type MergeRow = {
  type: 'merge';
  contexts: CandidateContextElement[];
  names: EsNameSuggestion[];
  bounds: Rect;
};

const alongTimeline = (a: Rect, b: Rect) => a.x - b.x || a.y - b.y;

const boxOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height });

/** The workshop notes that hold a suggested change a person could accept, along the timeline: never a locked note
 *  or one on a hidden or locked layer, where the change would be refused. */
export function changeMarks(
  elements: readonly Element[],
  inertIds: ReadonlySet<ElementId>,
): ChangeMark[] {
  const marks: ChangeMark[] = [];
  for (const el of elements) {
    if (el.type !== 'sticky' || el.locked || inertIds.has(el.id)) continue;
    const kind = eventStormingKindOf(el);
    const changes = noteChangesOf(el);
    if (kind && changes.length > 0) marks.push({ note: el, kind, changes });
  }
  return marks.sort((a, b) => alongTimeline(a.note, b.note));
}

/** A row per suggested note change, in timeline order of its note, a note's changes in the order it holds them. */
export function changeRows(
  elements: readonly Element[],
  inertIds: ReadonlySet<ElementId>,
): ChangeRow[] {
  return changeMarks(elements, inertIds).flatMap(({ note, kind, changes }) =>
    changes.map((change, index) => ({
      type: 'change' as const,
      note,
      kind,
      change,
      index,
      bounds: boxOf(note),
      beyond:
        change.change === 'reword' ? rewordRipple(elements, note.id, change, 'context').beyond : 0,
    })),
  );
}

/** A Names row per context that holds names for itself, then a Merge row per set of contexts a name was made for.
 *  A name for a context that is gone, and a context none of whose notes are left, have no row. */
export function nameRows(elements: readonly Element[]): (NamesRow | MergeRow)[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const contexts = candidateContexts(elements);
  const boundsOf = new Map<ElementId, Rect>();
  for (const c of contexts) {
    const notes = contextNotes(c, byId);
    if (notes.length > 0) boundsOf.set(c.id, contextBounds(notes));
  }
  const names: NamesRow[] = [];
  const merges = new Map<string, MergeRow>();
  for (const holder of contexts) {
    const bounds = boundsOf.get(holder.id);
    if (!bounds) continue;
    const own = nameSuggestionsFor(elements, [holder.id]);
    if (own.length > 0) names.push({ type: 'names', context: holder, names: own, bounds });
    for (const suggestion of holder.esContext.names ?? []) {
      if (!suggestion.with) continue;
      const ids = [holder.id, ...suggestion.with];
      if (!ids.every((id) => boundsOf.has(id))) continue;
      const key = [...ids].sort().join('\n');
      if (merges.has(key)) continue;
      merges.set(key, {
        type: 'merge',
        contexts: contexts.filter((c) => ids.includes(c.id)),
        names: nameSuggestionsFor(elements, ids),
        bounds: contextBounds(ids.map((id) => boundsOf.get(id)!)),
      });
    }
  }
  return [...names, ...merges.values()];
}
