// The kept candidate contexts as the reading lists them (docs/specs/021-event-storming/candidate-contexts.md "In the
// reading and the export"): each with its ref, its name and the notes it groups that the reading reads, in reading
// order; a context with none of them left is not listed. Suggested contexts are suggestions (suggestions.ts).

import {
  computeRefs,
  isKeptContext,
  type CandidateContextElement,
  type Tab,
} from '@livedoc/document';
import { wordsOf } from './notes';
import type { StormContext } from './types';

export function readContexts(
  tab: Pick<Tab, 'elements'>,
  order: ReadonlyMap<string, number>,
): StormContext[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const rank = (id: string) => order.get(id)!;
  return tab.elements
    .filter(isKeptContext)
    .map((el) => {
      const c = el as CandidateContextElement;
      const notes = [...new Set(c.esContext.notes)]
        .filter((id) => order.has(id))
        .sort((a, b) => rank(a) - rank(b));
      return { id: c.id, ref: refs.refOf(c.id), name: wordsOf(c.label), notes };
    })
    .filter((c) => c.notes.length > 0)
    .sort((a, b) => rank(a.notes[0]!) - rank(b.notes[0]!));
}
