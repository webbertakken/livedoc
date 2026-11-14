// What a board remembers as declined, as the storm view lists it (docs/specs/021-event-storming/asks.md "What was
// declined"): only the entries whose notes or contexts are all still on the board, with their refs. An entry about
// something gone can never be suggested again, so it says nothing to an agent.

import { computeRefs, declinedOf, type EsDeclined, type Tab } from '@livedoc/document';

export type StormDeclined = EsDeclined & { aboutRefs: string[] };

export function readDeclined(tab: Pick<Tab, 'elements' | 'esDeclined'>): StormDeclined[] {
  const refs = computeRefs(tab.elements.map((el) => el.id));
  const present = new Set(tab.elements.map((el) => el.id));
  return declinedOf(tab)
    .filter((d) => d.about.every((id) => present.has(id)))
    .map((d) => ({ ...d, aboutRefs: d.about.map((id) => refs.refOf(id)) }));
}
