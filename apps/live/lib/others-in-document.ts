// Everyone else in the document, once each, in the order the tabs list them, with the tab each is on: the people the
// bottom line's contributors and the office title row's presence show.
import type { Participant } from '@/lib/identity';

export type PersonOnTab = { participant: Participant; tabId: string };

export function othersInDocument(
  byTab: ReadonlyMap<string, readonly Participant[]>,
  selfId: string,
): PersonOnTab[] {
  const seen = new Map<string, PersonOnTab>();
  for (const [tabId, people] of byTab)
    for (const participant of people)
      if (participant.id !== selfId && !seen.has(participant.id))
        seen.set(participant.id, { participant, tabId });
  return [...seen.values()];
}
