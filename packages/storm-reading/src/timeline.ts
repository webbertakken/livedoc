// The timeline of events (docs/specs/021-event-storming/board-reading.md "The timeline"): each event in time order
// with what leads to it, decides it, follows it and flags it; the chains that carry a process from one event to the
// next; and the loose notes the timeline does not reach.

import type { ElementId } from '@livedoc/document';
import type { PlacedNote, StormChain, StormMoment, StormRelations } from './types';

// Time order: centre x, then lane from the top, then document order.
export function byTime(a: PlacedNote, b: PlacedNote): number {
  return a.cx - b.cx || a.lane - b.lane || a.index - b.index;
}

const pointingAt = (
  map: Record<ElementId, ElementId>,
  notes: readonly PlacedNote[],
  id: ElementId,
) => notes.filter((n) => map[n.id] === id).map((n) => n.id);

export type Timeline = {
  moments: StormMoment[];
  chains: StormChain[];
  loose: ElementId[];
  // Every note id in reading order: the timeline's, then the loose notes'.
  order: ElementId[];
};

export function buildTimeline(notes: readonly PlacedNote[], relations: StormRelations): Timeline {
  const timed = [...notes].sort(byTime);
  const kind = (k: PlacedNote['kind']) => timed.filter((n) => n.kind === k);
  const policies = kind('policy');
  const hotspots = kind('hotspot');
  const deciders = timed.filter((n) => n.kind === 'aggregate' || n.kind === 'external-system');
  const actorsAndPolicies = timed.filter((n) => n.kind === 'actor' || n.kind === 'policy');

  const order: ElementId[] = [];
  const seen = new Set<ElementId>();
  const visit = (...ids: ElementId[]) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
  };

  const moments: StormMoment[] = kind('domain-event').map((event) => {
    const commands = pointingAt(relations.causes, timed, event.id).map((command) => ({
      command,
      actors: pointingAt(relations.issues, kind('actor'), command),
      readModels: pointingAt(relations.informs, timed, command),
      policy: pointingAt(relations.issues, policies, command)[0] ?? null,
    }));
    const moment: StormMoment = {
      event: event.id,
      commands,
      deciders: pointingAt(relations.decides, deciders, event.id),
      policies: pointingAt(relations.triggers, policies, event.id).map((policy) => ({
        policy,
        issues: relations.issues[policy] ?? null,
      })),
      hotspots: [],
    };
    const members = [
      event.id,
      ...commands.flatMap((c) => [c.command, ...c.actors, ...c.readModels]),
      ...moment.deciders,
      ...moment.policies.map((p) => p.policy),
    ];
    moment.hotspots = hotspots
      .filter((h) => members.includes(relations.flags[h.id]!))
      .map((h) => h.id);
    for (const c of commands) visit(...c.readModels, ...c.actors, c.command);
    visit(
      ...moment.deciders,
      event.id,
      ...moment.policies.map((p) => p.policy),
      ...moment.hotspots,
    );
    return moment;
  });

  const chains: StormChain[] = moments.flatMap((m) =>
    m.policies
      .filter((p) => p.issues !== null)
      .map((p) => ({
        from: m.event,
        policy: p.policy,
        command: p.issues!,
        to: relations.causes[p.issues!] ?? null,
      })),
  );

  // A command a policy issues but no event follows is still reached through its policy.
  for (const chain of chains) visit(chain.command);
  for (const n of actorsAndPolicies) if (seen.has(relations.issues[n.id] ?? '')) visit(n.id);

  const loose = timed.filter((n) => !seen.has(n.id)).map((n) => n.id);
  visit(...loose);
  return { moments, chains, loose, order };
}
