// Name suggestions on an event-storming board (docs/specs/021-event-storming/suggested-changes.md "Name
// suggestions"): another name an agent proposes for a candidate context, or one name for several merged. They live on
// the context (`esContext.names`), so they travel and go with it; a merge's name is held by the context the merge
// keeps. Pure: every write answers the board after it, unchanged (the same array) when nothing changes.

import {
  CONTEXT_NAMES_MAX,
  candidateContexts,
  cleanContextName,
  isCandidateContext,
  mergeContexts,
  mergeKeeperOf,
  renameContext,
  type CandidateContextElement,
  type EsNameSuggestion,
} from './candidate-contexts';
import type { Element, ElementId } from './index';

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Two names that read the same: case and spacing aside. */
export function sameContextName(a: string, b: string): boolean {
  return key(a) === key(b);
}

// The contexts a held name is about: its holder and those it names with it.
const aboutOf = (holder: CandidateContextElement, s: EsNameSuggestion): ElementId[] => [
  holder.id,
  ...(s.with ?? []),
];

const sameSet = (a: readonly ElementId[], b: readonly ElementId[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// The context holding `names`, the field gone when none are left.
function withNames(
  context: CandidateContextElement,
  names: readonly EsNameSuggestion[],
): CandidateContextElement {
  const { names: _dropped, ...rest } = context.esContext;
  return { ...context, esContext: names.length ? { ...rest, names: [...names] } : rest };
}

// Every context's held names filtered by `keep`; the same array when none goes.
function filterNames(
  elements: Element[],
  keep: (holder: CandidateContextElement, s: EsNameSuggestion) => boolean,
): Element[] {
  let changed = false;
  const out = elements.map((el) => {
    if (!isCandidateContext(el) || !el.esContext.names) return el;
    const names = el.esContext.names.filter((s) => keep(el, s));
    if (names.length === el.esContext.names.length) return el;
    changed = true;
    return withNames(el, names);
  });
  return changed ? out : elements;
}

/** The names suggested for a selection: for one context, those it holds for itself; for several, those made for
 *  exactly that set, whichever of them holds each. */
export function nameSuggestionsFor(
  elements: readonly Element[],
  ids: readonly ElementId[],
): EsNameSuggestion[] {
  const wanted = [...new Set(ids)];
  return candidateContexts(elements)
    .filter((c) => wanted.includes(c.id))
    .flatMap((c) => (c.esContext.names ?? []).filter((s) => sameSet(aboutOf(c, s), wanted)));
}

/** How many name suggestions are open: those whose contexts are all still on the board. */
export function openNameSuggestions(elements: readonly Element[]): number {
  const contexts = candidateContexts(elements);
  const present = new Set(contexts.map((c) => c.id));
  return contexts
    .flatMap((c) => c.esContext.names ?? [])
    .filter((s) => (s.with ?? []).every((id) => present.has(id))).length;
}

/** A name suggested for one context, or for several merged: held by the context, or by the one a merge keeps.
 *  Unchanged for a blank name, a context not on the board, or a holder that already holds CONTEXT_NAMES_MAX. */
export function addNameSuggestion(
  elements: Element[],
  ids: readonly ElementId[],
  suggestion: { name: string; reason?: string; by?: string },
): Element[] {
  const wanted = [...new Set(ids)];
  const contexts = candidateContexts(elements);
  const name = cleanContextName(suggestion.name);
  if (!name || wanted.length === 0 || wanted.some((id) => !contexts.some((c) => c.id === id)))
    return elements;
  const holder =
    wanted.length === 1
      ? contexts.find((c) => c.id === wanted[0])!
      : mergeKeeperOf(elements, wanted)!;
  const held = holder.esContext.names ?? [];
  if (held.length >= CONTEXT_NAMES_MAX) return elements;
  const others = wanted.filter((id) => id !== holder.id);
  const entry: EsNameSuggestion = {
    name,
    ...(others.length ? { with: others } : {}),
    ...(suggestion.reason ? { reason: suggestion.reason } : {}),
    ...(suggestion.by ? { by: suggestion.by } : {}),
  };
  return elements.map((el) => (el.id === holder.id ? withNames(holder, [...held, entry]) : el));
}

/** A suggested name chosen: one context is renamed; several are merged and the kept one named. Either way the
 *  context drops its other name suggestions for itself. Unchanged, with no kept id, when that name was not suggested
 *  for exactly those contexts. */
export function chooseNameSuggestion(
  elements: Element[],
  ids: readonly ElementId[],
  name: string,
): { elements: Element[]; keptId: ElementId | null } {
  const wanted = [...new Set(ids)];
  const chosen = nameSuggestionsFor(elements, wanted).find((s) => sameContextName(s.name, name));
  if (!chosen) return { elements, keptId: null };
  const merged = wanted.length > 1 ? mergeContexts(elements, wanted) : null;
  const keptId = merged ? merged.keptId! : wanted[0]!;
  const named = renameContext(merged ? merged.elements : elements, keptId, chosen.name);
  return {
    elements: filterNames(named, (holder, s) => holder.id !== keptId || s.with !== undefined),
    keptId,
  };
}

/** The names shown for a selection dismissed: all of them, or only those given (ignoring case). */
export function dismissNameSuggestions(
  elements: Element[],
  ids: readonly ElementId[],
  names?: readonly string[],
): Element[] {
  const wanted = [...new Set(ids)];
  return filterNames(
    elements,
    (holder, s) =>
      !wanted.includes(holder.id) ||
      !sameSet(aboutOf(holder, s), wanted) ||
      (names !== undefined && !names.some((n) => sameContextName(n, s.name))),
  );
}

/** Every name a context holds dropped, for itself and for a merge: how an agent takes its own back. */
export function withoutNameSuggestions(elements: Element[], contextId: ElementId): Element[] {
  return filterNames(elements, (holder) => holder.id !== contextId);
}
