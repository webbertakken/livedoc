// How many suggestions are open on an event-storming board (docs/specs/021-event-storming/suggested-changes.md
// "Note changes"): a suggested note, a suggested context, a name suggestion, a note change and a lane plan count
// alike towards SUGGESTIONS_MAX.

import { isOpenSuggestion } from './candidate-contexts';
import { openNameSuggestions } from './context-names';
import { openLanePlan } from './event-storming-lane-plan';
import { openNoteChanges } from './note-changes';
import type { Element } from './index';

/** Every suggestion a person has yet to decide on: notes, contexts, names, note changes and a lane plan. */
export function openSuggestionCount(elements: readonly Element[]): number {
  return (
    elements.filter(isOpenSuggestion).length +
    openNameSuggestions(elements) +
    openNoteChanges(elements) +
    (openLanePlan(elements) ? 1 : 0)
  );
}
