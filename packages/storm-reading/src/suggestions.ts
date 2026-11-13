// A board's open suggestions as the storm view lists them (docs/specs/021-event-storming/suggestions.md,
// docs/specs/021-event-storming/candidate-contexts.md): suggested notes, each with its ref, the anchor's ref, and
// whether the anchor is gone, and suggested candidate contexts, each with its notes' refs. An orphan (the anchor gone,
// or every note of a context) is never shown in the editor.

import {
  computeRefs,
  eventStormingKindOf,
  isSuggestedContext,
  suggestionKindOf,
  type CandidateContextElement,
  type ElementId,
  type EsSuggestionSide,
  type EventStormingNoteKind,
  type Tab,
} from '@livedoc/document';
import { wordsOf } from './notes';

export type StormNoteSuggestion = {
  type: 'note';
  id: ElementId;
  ref: string;
  kind: EventStormingNoteKind;
  words: string;
  anchor: ElementId;
  anchorRef: string;
  side: EsSuggestionSide;
  reason: string | null;
  gap: string | null;
  by: string | null;
  orphan: boolean;
};

export type StormContextSuggestion = {
  type: 'context';
  id: ElementId;
  ref: string;
  name: string;
  // The notes it would group that are still on the board, and their refs.
  notes: ElementId[];
  noteRefs: string[];
  reason: string | null;
  by: string | null;
  orphan: boolean;
};

export type StormSuggestion = StormNoteSuggestion | StormContextSuggestion;

export function readSuggestions(tab: Pick<Tab, 'elements'>): StormSuggestion[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const ids = new Set(tab.elements.map((el) => el.id));
  const notes = new Set(tab.elements.filter((el) => eventStormingKindOf(el)).map((el) => el.id));
  const out: StormSuggestion[] = [];
  for (const el of tab.elements) {
    if (isSuggestedContext(el)) {
      const c = el as CandidateContextElement;
      const kept = c.esContext.notes.filter((id) => notes.has(id));
      out.push({
        type: 'context',
        id: c.id,
        ref: refs.refOf(c.id),
        name: wordsOf(c.label),
        notes: kept,
        noteRefs: kept.map((id) => refs.refOf(id)),
        reason: c.esContext.suggestion!.reason ?? null,
        by: c.esContext.suggestion!.by ?? null,
        orphan: kept.length === 0,
      });
      continue;
    }
    const kind = suggestionKindOf(el);
    if (!kind || el.type !== 'sticky' || !el.esSuggestion) continue;
    const s = el.esSuggestion;
    out.push({
      type: 'note',
      id: el.id,
      ref: refs.refOf(el.id),
      kind,
      words: wordsOf(el.label),
      anchor: s.anchorId,
      anchorRef: ids.has(s.anchorId) ? refs.refOf(s.anchorId) : s.anchorId,
      side: s.side,
      reason: s.reason ?? null,
      gap: s.gap ?? null,
      by: s.by ?? null,
      orphan: !ids.has(s.anchorId),
    });
  }
  return out;
}
