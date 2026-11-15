// Rename Term (docs/specs/021-event-storming/board-language.md "The Language tab"): one term changed everywhere it
// is used, or within one candidate context, by the one rule a reword's ripple matches by (event-storming-terms.ts).
// Pure: the preview and the write are the same answer, and a rename that changes nothing answers the same board.

import {
  cleanContextName,
  isKeptContext,
  type CandidateContextElement,
} from './candidate-contexts';
import { eventStormingKindOf } from './event-storming';
import { isSuggestion } from './event-storming-suggestions';
import { isValidTerm, replaceTerm } from './event-storming-terms';
import type { Element, ElementId } from './index';

/** How far a rename reaches: every note and kept context name on the board, one kept context's notes and its name,
 *  or the notes in no kept context. */
export type TermScope = { type: 'board' } | { type: 'context'; id: ElementId } | { type: 'none' };

/** What a rename changes: the notes and the kept context names that take the new term, with their new words. */
export type TermRename = {
  notes: { id: ElementId; words: string }[];
  contexts: { id: ElementId; name: string }[];
};

const NOTHING: TermRename = { notes: [], contexts: [] };

/** What renaming `from` to `to` within `scope` would change. Nothing for a term that is not one, and for a note in
 *  `inert` (locked, or on a layer that takes no change). Suggestions are no notes of the board yet. */
export function termRename(
  elements: readonly Element[],
  from: string,
  to: string,
  scope: TermScope,
  inert: ReadonlySet<ElementId> = new Set(),
): TermRename {
  if (!isValidTerm(from) || !isValidTerm(to)) return NOTHING;
  const kept = elements.filter((el): el is CandidateContextElement => isKeptContext(el));
  const grouped = new Set(kept.flatMap((c) => c.esContext.notes));
  const own = scope.type === 'context' ? kept.find((c) => c.id === scope.id) : undefined;
  const reaches = (id: ElementId): boolean =>
    scope.type === 'board' ||
    (scope.type === 'none'
      ? !grouped.has(id)
      : own !== undefined && own.esContext.notes.includes(id));
  const notes: TermRename['notes'] = [];
  for (const el of elements) {
    if (el.type !== 'sticky' || eventStormingKindOf(el) === null || isSuggestion(el)) continue;
    if (inert.has(el.id) || !reaches(el.id)) continue;
    const was = el.label ?? '';
    const words = replaceTerm(was, from, to);
    if (words !== was) notes.push({ id: el.id, words });
  }
  const named = scope.type === 'board' ? kept : own ? [own] : [];
  const contexts = named
    .filter((c) => !inert.has(c.id))
    .map((c) => ({
      id: c.id,
      name: cleanContextName(replaceTerm(c.label, from, to)),
      was: c.label,
    }))
    .filter((c) => c.name !== c.was)
    .map(({ id, name }) => ({ id, name }));
  return { notes, contexts };
}

/** The board with `from` renamed to `to` within `scope`: one write. The same array when nothing would change. Label
 *  formatting described the old words, so it goes with them. */
export function renameTerm(
  elements: Element[],
  from: string,
  to: string,
  scope: TermScope,
  inert?: ReadonlySet<ElementId>,
): Element[] {
  const { notes, contexts } = termRename(elements, from, to, scope, inert);
  if (notes.length === 0 && contexts.length === 0) return elements;
  const words = new Map<ElementId, string>([
    ...notes.map((n) => [n.id, n.words] as const),
    ...contexts.map((c) => [c.id, c.name] as const),
  ]);
  return elements.map((el) => {
    const label = words.get(el.id);
    if (label === undefined) return el;
    const { richText: _runs, ...rest } = el as Element & { richText?: unknown };
    return { ...rest, label };
  });
}
