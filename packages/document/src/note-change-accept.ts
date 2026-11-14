// Accepting a note change on an event-storming board (docs/specs/021-event-storming/suggested-changes.md "A reword
// ripples", "Accepting"): what the board becomes when a person takes a suggested reword, kind, split or removal. A
// reword that names a term ripples through the notes that hold it, its own context first. Pure: every write answers
// the board after it, unchanged (the same array) when the note no longer holds that change.

import { withDependents } from './arrow-rebind';
import { candidateContexts, cleanContextName, pruneNameSuggestions } from './candidate-contexts';
import {
  changeEventStormingKind,
  eventStormingKindOf,
  eventStormingNoteFields,
} from './event-storming';
import { suggestionBounds } from './event-storming-suggestions';
import { replaceTerm } from './event-storming-terms';
import {
  noteChangesOf,
  sameNoteChange,
  withNoteChanges,
  type EsKindChange,
  type EsNoteChange,
  type EsRewordChange,
  type EsSplitChange,
} from './note-changes';
import type { Element, ElementId, StickyElement } from './index';

/** How far a reword's term reaches: the note's own candidate context (for a note in none, the notes in none), or
 *  every note and context name on the board. */
export type RewordScope = 'context' | 'board';

/** What a reword changes beside its own note: the notes and context names that take the term, with their new words,
 *  and how many more notes hold the term outside the scope. */
export type RewordRipple = {
  notes: { id: ElementId; words: string }[];
  contexts: { id: ElementId; name: string }[];
  beyond: number;
};

// The workshop note that still holds `change`, or null.
function holderOf(
  elements: readonly Element[],
  noteId: ElementId,
  change: EsNoteChange,
): StickyElement | null {
  const el = elements.find((e) => e.id === noteId);
  if (!el || el.type !== 'sticky') return null;
  return noteChangesOf(el).some((c) => sameNoteChange(c, change)) ? el : null;
}

// An element with new plain words: label formatting describes the old text, so it goes (rich-text.ts).
function relabelled<T extends Element>(el: T, label: string): T {
  const { richText: _runs, ...rest } = el as T & { richText?: unknown };
  return { ...rest, label } as T;
}

export function rewordRipple(
  elements: readonly Element[],
  noteId: ElementId,
  change: EsRewordChange,
  scope: RewordScope,
): RewordRipple {
  const { term, to } = change;
  if (!term || !to) return { notes: [], contexts: [], beyond: 0 };
  const contexts = candidateContexts(elements);
  const contextOfNote = new Map<ElementId, ElementId>();
  for (const c of contexts)
    for (const id of c.esContext.notes) if (!contextOfNote.has(id)) contextOfNote.set(id, c.id);
  const own = contextOfNote.get(noteId);
  const notes: RewordRipple['notes'] = [];
  let beyond = 0;
  for (const el of elements) {
    if (el.id === noteId || el.type !== 'sticky' || eventStormingKindOf(el) === null) continue;
    const was = el.label ?? '';
    const words = replaceTerm(was, term, to);
    if (words === was) continue;
    if (scope === 'board' || contextOfNote.get(el.id) === own) notes.push({ id: el.id, words });
    else beyond += 1;
  }
  const named = contexts
    .filter((c) => scope === 'board' || c.id === own)
    .map((c) => ({
      id: c.id,
      name: cleanContextName(replaceTerm(c.label, term, to)),
      was: c.label,
    }))
    .filter((c) => c.name !== c.was)
    .map(({ id, name }) => ({ id, name }));
  return { notes, contexts: named, beyond };
}

/** A reword accepted: the note takes the words, the notes and context names in scope take the term, and the note's
 *  other rewords are dropped. */
export function acceptReword(
  elements: Element[],
  noteId: ElementId,
  change: EsRewordChange,
  scope: RewordScope,
): Element[] {
  const note = holderOf(elements, noteId, change);
  if (!note) return elements;
  const ripple = rewordRipple(elements, noteId, change, scope);
  const words = new Map([
    ...ripple.notes.map((n) => [n.id, n.words] as const),
    ...ripple.contexts.map((c) => [c.id, c.name] as const),
  ]);
  const kept = noteChangesOf(note).filter((c) => c.change !== 'reword');
  return elements.map((el) => {
    if (el.id === noteId) return withNoteChanges(relabelled(note, change.words), kept);
    const next = words.get(el.id);
    return next === undefined ? el : relabelled(el, next);
  });
}

/** A kind change accepted: the note changes kind as Change Kind changes it, and its other kind changes are dropped. */
export function acceptKindChange(
  elements: Element[],
  noteId: ElementId,
  change: EsKindChange,
): Element[] {
  const note = holderOf(elements, noteId, change);
  if (!note) return elements;
  const kept = noteChangesOf(note).filter((c) => c.change !== 'kind');
  return elements.map((el) =>
    el.id === noteId ? withNoteChanges(changeEventStormingKind(note, change.kind), kept) : el,
  );
}

/** A split accepted, up to the landing: the note keeps the first part and drops its splits, and each further part is
 *  added as a suggestion of the note's kind chained after it (the second after the note, the third after the
 *  second). The editor applies `partIds` in the same step, so they land as any applied `after` suggestion lands. */
export function acceptSplit(
  elements: Element[],
  noteId: ElementId,
  change: EsSplitChange,
  makeId: () => ElementId,
): { elements: Element[]; partIds: ElementId[] } {
  const note = holderOf(elements, noteId, change);
  if (!note) return { elements, partIds: [] };
  const kind = eventStormingKindOf(note)!;
  const [first, ...more] = change.parts;
  const kept = noteChangesOf(note).filter((c) => c.change !== 'split');
  const parts: StickyElement[] = [];
  let anchor: StickyElement = note;
  for (const words of more) {
    const part: StickyElement = {
      id: makeId(),
      type: 'sticky',
      ...eventStormingNoteFields(kind),
      ...suggestionBounds(anchor, 'after', kind),
      label: words,
      ...(note.layerId !== undefined ? { layerId: note.layerId } : {}),
      esSuggestion: {
        anchorId: anchor.id,
        side: 'after',
        ...(change.reason ? { reason: change.reason } : {}),
        ...(change.by ? { by: change.by } : {}),
      },
    };
    parts.push(part);
    anchor = part;
  }
  return {
    elements: [
      ...elements.map((el) =>
        el.id === noteId ? withNoteChanges(relabelled(note, first!), kept) : el,
      ),
      ...parts,
    ],
    partIds: parts.map((p) => p.id),
  };
}

/** A removal accepted: the note goes as Delete removes it, with what was suggested on it and a context it empties. */
export function acceptRemoval(elements: Element[], noteId: ElementId): Element[] {
  if (!holderOf(elements, noteId, { change: 'remove' })) return elements;
  const gone = withDependents(elements, new Set([noteId]));
  return pruneNameSuggestions(elements.filter((el) => !gone.has(el.id)));
}
