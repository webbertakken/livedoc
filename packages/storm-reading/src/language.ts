// The board language (docs/specs/021-event-storming/board-language.md "Terms"): the words the board's notes share,
// where each is used, found from the notes' words alone. No model finds a term.

import type { ElementId } from '@livedoc/document';
import { LANGUAGE_STOP_WORDS, TERM_MIN_LETTERS, TERM_MIN_NOTES } from './constants';
import type { StormReading } from './types';

export type BoardTerm = {
  // The term in the casing it is most often written in.
  term: string;
  // What it is compared by: lower case, a plain plural folded onto its singular.
  key: string;
  // The notes that hold it, in reading order.
  notes: ElementId[];
  // The kept candidate contexts those notes belong to, in the reading's order.
  contexts: ElementId[];
  // How many of those notes are in no kept context.
  outside: number;
};

const WORDS = /[\p{L}\p{N}]+/gu;

type Found = { notes: ElementId[]; forms: Map<string, number> };

export function boardTerms(reading: StormReading): BoardTerm[] {
  // Every word as written, by its lower-cased form, with the notes that hold it, in reading order.
  const written = new Map<string, Found>();
  for (const note of reading.notes) {
    for (const word of new Set(note.words.match(WORDS) ?? [])) {
      const lower = word.toLowerCase();
      const found = written.get(lower) ?? { notes: [], forms: new Map<string, number>() };
      if (!found.notes.includes(note.id)) found.notes.push(note.id);
      found.forms.set(word, (found.forms.get(word) ?? 0) + 1);
      written.set(lower, found);
    }
  }

  // A plain plural counts as its singular, when the singular is on the board; it shows as the singular.
  const terms = new Map<string, Found>();
  for (const [lower, found] of written) {
    const stem = lower.slice(0, -1);
    const plural = lower.endsWith('s') && written.has(stem);
    const key = plural ? stem : lower;
    const term = terms.get(key) ?? { notes: [], forms: new Map<string, number>() };
    for (const id of found.notes) if (!term.notes.includes(id)) term.notes.push(id);
    for (const [form, count] of found.forms) {
      const shown = plural ? form.slice(0, -1) : form;
      term.forms.set(shown, (term.forms.get(shown) ?? 0) + count);
    }
    terms.set(key, term);
  }

  const order = new Map(reading.notes.map((n) => [n.id, n.order]));
  const contextOf = new Map<ElementId, ElementId>();
  for (const context of reading.contexts)
    for (const id of context.notes) contextOf.set(id, context.id);

  return [...terms]
    .filter(
      ([key, found]) =>
        [...key].length >= TERM_MIN_LETTERS &&
        !LANGUAGE_STOP_WORDS.has(key) &&
        found.notes.length >= TERM_MIN_NOTES,
    )
    .map(([key, found]) => {
      const notes = [...found.notes].sort((a, b) => order.get(a)! - order.get(b)!);
      const used = new Set(notes.map((id) => contextOf.get(id)).filter((c) => c !== undefined));
      return {
        term: mostWritten(found.forms),
        key,
        notes,
        contexts: reading.contexts.filter((c) => used.has(c.id)).map((c) => c.id),
        outside: notes.filter((id) => !contextOf.has(id)).length,
      };
    })
    .sort((a, b) => b.notes.length - a.notes.length || a.key.localeCompare(b.key));
}

// The form written most often; the first met on a tie (a Map keeps the order its forms were first written in).
function mostWritten(forms: ReadonlyMap<string, number>): string {
  let best = '';
  let bestCount = 0;
  for (const [form, count] of forms) {
    if (count > bestCount) {
      best = form;
      bestCount = count;
    }
  }
  return best;
}
