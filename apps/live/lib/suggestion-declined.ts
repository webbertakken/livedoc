import {
  candidateContexts,
  declinedChange,
  declinedContext,
  declinedName,
  declinedNote,
  isSuggestedContext,
  isSuggestion,
  nameSuggestionsFor,
  noteChangesOf,
  sameContextName,
  withDeclined,
  withDependents,
  type Element,
  type ElementId,
  type EsDeclined,
  type Tab,
} from '@livedoc/document';
import { nameRows } from './suggested-changes';

// What a person's dismissal is remembered as (docs/specs/021-event-storming/asks.md "What was declined"): the
// entries the board's declined list gains, worked out from the board as it stands before the dismissal, so the same
// undoable step that drops a suggestion also remembers it. Pure.

/** The suggested notes and suggested contexts among `ids` as declined: a suggested note with every suggestion
 *  chained on it (they go with it). Anything else among `ids` is passed over. */
export function declinedSuggestions(
  elements: readonly Element[],
  ids: readonly ElementId[],
): EsDeclined[] {
  const asked = new Set(ids);
  const notes = new Set(
    elements.filter((el) => asked.has(el.id) && isSuggestion(el)).map((el) => el.id),
  );
  const going = withDependents(elements, notes);
  const entries: EsDeclined[] = [];
  for (const el of elements) {
    if (el.type === 'sticky' && going.has(el.id) && isSuggestion(el))
      entries.push(declinedNote(elements, el));
  }
  for (const context of candidateContexts(elements))
    if (asked.has(context.id) && isSuggestedContext(context))
      entries.push(declinedContext(context));
  return entries;
}

/** The names suggested for exactly these contexts as declined: all of them, or only those given (ignoring case). */
export function declinedNames(
  elements: readonly Element[],
  contextIds: readonly ElementId[],
  names?: readonly string[],
): EsDeclined[] {
  return nameSuggestionsFor(elements, contextIds)
    .filter((s) => names === undefined || names.some((n) => sameContextName(n, s.name)))
    .map((s) => declinedName(contextIds, s.name));
}

/** Everything open on the board as declined: what Dismiss All remembers. */
export function declinedEverything(elements: readonly Element[]): EsDeclined[] {
  const open = elements
    .filter((el) => isSuggestion(el) || isSuggestedContext(el))
    .map((el) => el.id);
  const names = nameRows(elements).flatMap((row) =>
    declinedNames(
      elements,
      row.type === 'names' ? [row.context.id] : row.contexts.map((c) => c.id),
    ),
  );
  const changes = elements.flatMap((el) =>
    noteChangesOf(el).map((change) => declinedChange(el.id, change)),
  );
  return [...declinedSuggestions(elements, open), ...names, ...changes];
}

/** A dismissal as one step over the tab: the board `dismiss` leaves, and what `declined` says of the board before
 *  it remembered. The same tab, remembering nothing, when nothing was dismissed. */
export function dismissedTab(
  tab: Tab,
  dismiss: (elements: Element[]) => Element[],
  declined: (elements: readonly Element[]) => EsDeclined[],
): Tab {
  const elements = dismiss(tab.elements);
  if (elements === tab.elements) return tab;
  return withDeclined({ ...tab, elements }, declined(tab.elements));
}
