// A board's open suggestions as the storm view lists them (docs/specs/021-event-storming/suggestions.md): each with
// its ref, the anchor's ref, and whether the anchor is gone (an orphan, never shown in the editor).

import {
  computeRefs,
  suggestionKindOf,
  type ElementId,
  type EsSuggestionSide,
  type EventStormingNoteKind,
  type Tab,
} from '@livedoc/document';
import { wordsOf } from './notes';

export type StormSuggestion = {
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

export function readSuggestions(tab: Pick<Tab, 'elements'>): StormSuggestion[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const ids = new Set(tab.elements.map((el) => el.id));
  const out: StormSuggestion[] = [];
  for (const el of tab.elements) {
    const kind = suggestionKindOf(el);
    if (!kind || el.type !== 'sticky' || !el.esSuggestion) continue;
    const s = el.esSuggestion;
    out.push({
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
