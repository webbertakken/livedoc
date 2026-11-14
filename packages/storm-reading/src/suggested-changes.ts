// A board's suggested changes as the storm view lists them (docs/specs/021-event-storming/suggested-changes.md): the
// names suggested for candidate contexts, each with the refs of the contexts it is for, then the changes suggested
// to notes, in timeline order of their note.

import {
  candidateContexts,
  computeRefs,
  noteChangesOf,
  type ElementId,
  type EsNoteChange,
  type Tab,
} from '@livedoc/document';

export type StormNameSuggestion = {
  type: 'name';
  // The contexts it is for: one, or several it would name merged. The first holds it.
  contexts: ElementId[];
  contextRefs: string[];
  name: string;
  reason: string | null;
  by: string | null;
};

// A change without who and why, which the row carries as `reason` and `by`.
type Proposed<C> = C extends unknown ? Omit<C, 'reason' | 'by'> : never;

export type StormNoteChange = Proposed<EsNoteChange> & {
  type: 'change';
  note: ElementId;
  noteRef: string;
  reason: string | null;
  by: string | null;
};

export type StormSuggestedChange = StormNameSuggestion | StormNoteChange;

export function readSuggestedChanges(tab: Pick<Tab, 'elements'>): StormSuggestedChange[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const contexts = candidateContexts(tab.elements);
  const present = new Set(contexts.map((c) => c.id));
  const names: StormNameSuggestion[] = contexts.flatMap((c) =>
    (c.esContext.names ?? [])
      // A name for a context that is gone is never shown, as an orphaned suggestion is not.
      .filter((s) => (s.with ?? []).every((id) => present.has(id)))
      .map((s) => {
        const ids = [c.id, ...(s.with ?? [])];
        return {
          type: 'name' as const,
          contexts: ids,
          contextRefs: ids.map((id) => refs.refOf(id)),
          name: s.name,
          reason: s.reason ?? null,
          by: s.by ?? null,
        };
      }),
  );
  const changes: StormNoteChange[] = tab.elements
    .map((el, index) => ({ el, index, held: noteChangesOf(el) }))
    .filter(({ held }) => held.length > 0)
    .map((row) => ({ ...row, box: row.el as { x: number; y: number; width: number } }))
    // Timeline order: by the note's moment, then from the top, then as the board holds them.
    .sort(
      (a, b) =>
        a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2) ||
        a.box.y - b.box.y ||
        a.index - b.index,
    )
    .flatMap(({ el, held }) =>
      held.map(({ reason, by, ...change }) => ({
        ...change,
        type: 'change' as const,
        note: el.id,
        noteRef: refs.refOf(el.id),
        reason: reason ?? null,
        by: by ?? null,
      })),
    );
  return [...names, ...changes];
}
