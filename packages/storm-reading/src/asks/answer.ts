// What an ask adds to a board (docs/specs/021-event-storming/asks.md "The built-in hand"): the route answers the
// suggestions its engine run left on the board as sent, and the editor adds them to the board as it is by then,
// passing over what no longer fits. Pure; both ends share these shapes.

import {
  SUGGESTIONS_MAX,
  addNameSuggestion,
  addNoteChange,
  candidateContexts,
  isCandidateContext,
  isLanePlan,
  isSuggestedContext,
  noteChangesOf,
  openSuggestionCount,
  sameNoteChange,
  withLanePlan,
  type Element,
  type ElementId,
  type EsNameSuggestion,
  type EsNoteChange,
} from '@livedoc/document';

/** A name suggested for one context, or for several merged. */
export type AskedName = { contexts: ElementId[]; name: string; reason?: string; by?: string };

export type AskAnswer = {
  // New suggestion elements: suggested notes, suggested contexts, a lane plan.
  added: Element[];
  // Name suggestions and note changes, by the elements they belong on.
  names: AskedName[];
  changes: { note: ElementId; change: EsNoteChange }[];
};

const sameName = (a: EsNameSuggestion, b: EsNameSuggestion) =>
  a.name === b.name && JSON.stringify(a.with ?? []) === JSON.stringify(b.with ?? []);

/** What `after` holds that `before` did not: what the engine's run suggested. */
export function askAnswerOf(before: readonly Element[], after: readonly Element[]): AskAnswer {
  const was = new Map(before.map((el) => [el.id, el]));
  const wasContext = new Map(candidateContexts(before).map((c) => [c.id, c]));
  // A context the answer adds carries its own names with it.
  const names = candidateContexts(after).flatMap((context) => {
    const earlier = wasContext.get(context.id);
    if (!earlier) return [];
    const held = earlier.esContext.names ?? [];
    return (context.esContext.names ?? [])
      .filter((name) => !held.some((h) => sameName(h, name)))
      .map(({ name, with: others = [], ...why }) => ({
        contexts: [context.id, ...others],
        name,
        ...why,
      }));
  });
  const changes = after.flatMap((el) => {
    const earlier = was.get(el.id);
    if (!earlier) return [];
    const held = noteChangesOf(earlier);
    return noteChangesOf(el)
      .filter((change) => !held.some((h) => sameNoteChange(h, change)))
      .map((change) => ({ note: el.id, change }));
  });
  return { added: after.filter((el) => !was.has(el.id)), names, changes };
}

// One added element onto the board as it is; unchanged when it no longer fits or is no suggestion.
function land(elements: Element[], el: Element): Element[] {
  if (isLanePlan(el)) return withLanePlan(elements, el);
  const ids = new Set(elements.map((e) => e.id));
  if (ids.has(el.id)) return elements;
  if (el.type === 'sticky' && el.esSuggestion)
    return ids.has(el.esSuggestion.anchorId) ? [...elements, el] : elements;
  if (!isCandidateContext(el) || !isSuggestedContext(el)) return elements;
  const notes = el.esContext.notes.filter((id) => ids.has(id));
  return notes.length > 0
    ? [...elements, { ...el, esContext: { ...el.esContext, notes } }]
    : elements;
}

/** The answer added to the board as it is by now, and how many suggestions landed. What names a note or a context
 *  that has gone is passed over, as is anything past the most suggestions a board holds. */
export function addAskAnswer(
  elements: Element[],
  answer: AskAnswer,
): { elements: Element[]; added: number } {
  const steps: ((board: Element[]) => Element[])[] = [
    ...answer.added.map((el) => (board: Element[]) => land(board, el)),
    ...answer.names.map(
      ({ contexts, ...name }) =>
        (board: Element[]) =>
          addNameSuggestion(board, contexts, name),
    ),
    ...answer.changes.map(
      ({ note, change }) =>
        (board: Element[]) =>
          addNoteChange(board, note, change),
    ),
  ];
  let board = elements;
  let added = 0;
  for (const step of steps) {
    const next = step(board);
    if (next === board) continue;
    // A plan that replaces one adds none to the count; anything else past the limit is left out.
    if (openSuggestionCount(next) > SUGGESTIONS_MAX) continue;
    board = next;
    added += 1;
  }
  return { elements: board, added };
}
