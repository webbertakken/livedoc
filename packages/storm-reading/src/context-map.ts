// The context map (docs/specs/021-event-storming/board-reading.md "The context map"): how the kept candidate contexts
// depend on each other, read from the relations of the flow whose two notes sit in two different contexts.

import type { ElementId } from '@livedoc/document';
import type {
  CrossingRelation,
  StormContext,
  StormContextLink,
  StormCrossing,
  StormNote,
  StormRelations,
} from './types';

export function readContextMap(
  notes: readonly StormNote[],
  relations: StormRelations,
  contexts: readonly StormContext[],
): StormContextLink[] {
  if (contexts.length < 2) return [];
  const contextOf = new Map<ElementId, ElementId>();
  for (const context of contexts) for (const id of context.notes) contextOf.set(id, context.id);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const order = (id: ElementId) => byId.get(id)!.order;

  // Each relation as the flow runs it: an event triggers a policy, a policy issues a command, a command causes an event.
  const flow: StormCrossing[] = [];
  const add = (relation: CrossingRelation, from: ElementId, to: ElementId) =>
    flow.push({ relation, from, to });
  for (const [policy, event] of Object.entries(relations.triggers)) add('triggers', event, policy);
  for (const [issuer, command] of Object.entries(relations.issues))
    if (byId.get(issuer)!.kind === 'policy') add('issues', issuer, command);
  for (const [command, event] of Object.entries(relations.causes)) add('causes', command, event);

  const links = new Map<string, StormContextLink>();
  const crossings = flow
    .filter((c) => {
      const from = contextOf.get(c.from);
      const to = contextOf.get(c.to);
      return from !== undefined && to !== undefined && from !== to;
    })
    .sort((a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to));
  for (const crossing of crossings) {
    const from = contextOf.get(crossing.from)!;
    const to = contextOf.get(crossing.to)!;
    const key = `${from}\u0000${to}`;
    const link = links.get(key) ?? { from, to, crossings: [] };
    link.crossings.push(crossing);
    links.set(key, link);
  }
  return [...links.values()];
}
