import {
  contextBounds,
  contextNotes,
  isSuggestedContext,
  type CandidateContextElement,
  type Element,
  type ElementId,
  type Rect,
} from '@livedoc/document';
import {
  changeRows,
  nameRows,
  type ChangeRow,
  type MergeRow,
  type NamesRow,
} from './suggested-changes';
import type { SuggestionElement } from './suggestion-hints';
import { changeKey, contextsKey } from './suggestion-view';

// The suggestions panel's rows (docs/specs/021-event-storming/suggestions.md "The suggestions panel"): every open
// suggestion of a board in one timeline: suggested notes, suggested contexts, the names suggested for a context or a
// merge, and the changes suggested to a note. Pure: what a row is, what it previews and what it brings into view.

export type NoteRow = { type: 'note'; suggestion: SuggestionElement; spot: Rect; anchor: Rect };
export type ContextRow = {
  type: 'context';
  context: CandidateContextElement;
  bounds: Rect;
  notes: number;
};
export type PanelRow = NoteRow | ContextRow | NamesRow | MergeRow | ChangeRow;

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** A row's own id among the rows of one board. */
export function panelRowId(row: PanelRow): string {
  switch (row.type) {
    case 'note':
      return row.suggestion.id;
    case 'context':
      return row.context.id;
    case 'names':
      return `names:${row.context.id}`;
    case 'merge':
      return `merge:${row.contexts
        .map((c) => c.id)
        .sort()
        .join(' ')}`;
    case 'change':
      return `change:${row.note.id}:${row.index}`;
  }
}

/** What pointing at a row previews: the suggestion alone, the context at full strength, a change as its mark
 *  previews it, or the contexts a name was suggested for. */
export function panelRowKey(row: PanelRow): string {
  switch (row.type) {
    case 'note':
      return `s:${row.suggestion.id}`;
    case 'context':
      return `c:${row.context.id}`;
    case 'names':
      return contextsKey([row.context.id]);
    case 'merge':
      return contextsKey(row.contexts.map((c) => c.id));
    case 'change':
      return changeKey(row.note.id, row.index);
  }
}

/** The box pointing at a row brings into view: a suggested note's anchor and its spot, or the row's own box. */
export function panelRowBounds(row: PanelRow): Rect {
  return row.type === 'note' ? union(row.anchor, row.spot) : row.bounds;
}

// The suggested candidate contexts as rows (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and
// decides"), each with the box of its notes still on the board; one with none left is an orphan, never listed.
function suggestedContextRows(elements: readonly Element[]): ContextRow[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const rows: ContextRow[] = [];
  for (const el of elements) {
    if (!isSuggestedContext(el)) continue;
    const context = el as CandidateContextElement;
    const notes = contextNotes(context, byId);
    if (notes.length > 0)
      rows.push({ type: 'context', context, bounds: contextBounds(notes), notes: notes.length });
  }
  return rows;
}

export type PanelRowsInput = {
  elements: readonly Element[];
  // Every suggested note with a spot, in timeline order (`suggestionsInTimeline`).
  timeline: readonly { suggestion: SuggestionElement; spot: Rect; anchor: Rect }[];
  // Where Apply All would land each suggested note, while Show All draws the board so.
  showAllSpots: ReadonlyMap<ElementId, Rect> | null;
  inertIds: ReadonlySet<ElementId>;
};

/** Every row in one timeline: a note by where it lands, anything else by its left-most note. */
export function panelRows({
  elements,
  timeline,
  showAllSpots,
  inertIds,
}: PanelRowsInput): PanelRow[] {
  const notes: NoteRow[] = timeline.map(({ suggestion, spot, anchor }) => ({
    type: 'note',
    suggestion,
    anchor,
    spot: showAllSpots?.get(suggestion.id) ?? spot,
  }));
  const rows: PanelRow[] = [
    ...notes,
    ...suggestedContextRows(elements),
    ...nameRows(elements),
    ...changeRows(elements, inertIds),
  ];
  const at = (row: PanelRow) => (row.type === 'note' ? row.spot : row.bounds);
  return rows.sort((a, b) => at(a).x - at(b).x || at(a).y - at(b).y);
}
