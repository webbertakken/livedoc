// The storm view (docs/specs/021-event-storming/board-reading.md "Output"): the reading as compact text. The About,
// one line per note in timeline order (a pivotal event marked so, an answered hotspot with its answer), the loose
// notes, the lanes, the contexts and their map, the gaps and the open suggestions. Refs name every note, so an agent
// can address any of them in an edit operation.

import type { ElementId, EventStormingNoteKind } from '@livedoc/document';
import type { StormSuggestion } from './suggestions';
import type { CrossingRelation, StormNote, StormReading } from './types';

const KIND_WORD: Record<EventStormingNoteKind, string> = {
  'domain-event': 'event',
  command: 'command',
  actor: 'actor',
  policy: 'policy',
  'read-model': 'read-model',
  'external-system': 'external',
  aggregate: 'aggregate',
  hotspot: 'hotspot',
};

// A crossing as the flow runs it, from the upstream note to the downstream one.
const CROSSING_VERB: Record<CrossingRelation, string> = {
  triggers: 'triggers',
  issues: 'issues',
  causes: 'causes',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatStormView(
  reading: StormReading,
  suggestions: readonly StormSuggestion[],
): string[] {
  const byId = new Map<ElementId, StormNote>(reading.notes.map((n) => [n.id, n]));
  const answers = new Map(reading.decisions.map((d) => [d.hotspot, d.answer]));
  const pivotal = new Set(reading.pivotal);
  const say = (id: ElementId) => {
    const n = byId.get(id)!;
    const answer = answers.get(id);
    return `${KIND_WORD[n.kind]} ${n.ref} "${n.words}"${answer ? ` = "${answer}"` : ''}`;
  };
  const contexts = reading.contexts;
  const contextSaid = new Map(contexts.map((c) => [c.id, `${c.ref} "${c.name}"`]));
  const open = suggestions.filter((s) => !s.orphan);
  const orphans = suggestions.length - open.length;
  const lines = [
    [
      `board "${reading.board.name}"`,
      plural(reading.notes.length, 'note'),
      plural(reading.timeline.length, 'event'),
      plural(reading.chains.length, 'chain'),
      plural(reading.gaps.length, 'gap'),
      ...(contexts.length > 0 ? [plural(contexts.length, 'context')] : []),
      plural(open.length, 'suggestion'),
    ].join(' · '),
  ];
  if (reading.notes.length === 0) lines.push('no notes');
  if (reading.about)
    lines.push('about', ...reading.about.split('\n').map((line) => `  ${line.trim()}`));

  if (reading.timeline.length > 0) lines.push('timeline');
  reading.timeline.forEach((m, i) => {
    lines.push(`${i + 1} ${say(m.event)}${pivotal.has(m.event) ? ' · pivotal' : ''}`);
    for (const c of m.commands) {
      const by = [...c.actors, ...c.readModels, ...(c.policy ? [c.policy] : [])].map(say);
      lines.push(`  <- ${say(c.command)}${by.length ? ` · ${by.join(' · ')}` : ''}`);
    }
    for (const d of m.deciders) lines.push(`  @ ${say(d)}`);
    for (const p of m.policies)
      lines.push(`  -> ${say(p.policy)}${p.issues ? ` => ${say(p.issues)}` : ''}`);
    for (const h of m.hotspots) lines.push(`  ! ${say(h)}`);
  });

  if (reading.loose.length > 0) {
    lines.push('loose');
    for (const id of reading.loose) lines.push(`  ${say(id)}`);
  }

  // The lanes in use, by the number a lane plan names them by (docs/specs/021-event-storming/lane-plans.md).
  if (reading.lanes.length > 0) {
    lines.push('lanes');
    for (const lane of reading.lanes)
      lines.push(
        `  ${lane.number}${lane.name ? ` "${lane.name}"` : ''}: ${lane.notes.map((id) => byId.get(id)!.ref).join(',')}`,
      );
  }

  if (contexts.length > 0) {
    lines.push('contexts');
    for (const c of contexts)
      lines.push(`  ${c.ref} "${c.name}": ${c.notes.map((id) => byId.get(id)!.ref).join(',')}`);
  }

  if (reading.contextMap.length > 0) {
    lines.push('context map');
    for (const link of reading.contextMap)
      for (const c of link.crossings)
        lines.push(
          `  ${contextSaid.get(link.from)!} -> ${contextSaid.get(link.to)!}: ${say(c.from)} ${CROSSING_VERB[c.relation]} ${say(c.to)}`,
        );
  }

  if (reading.gaps.length > 0) {
    lines.push('gaps');
    for (const g of reading.gaps) {
      const remedy = g.remedy
        ? ` (remedy: ${KIND_WORD[g.remedy.kind]} ${g.remedy.side} ${byId.get(g.remedy.anchor)!.ref})`
        : '';
      lines.push(
        `  ${g.level} ${g.code} ${g.ids.map((id) => byId.get(id)!.ref).join(',')}: ${g.message}${remedy}`,
      );
    }
  }

  if (suggestions.length > 0) {
    lines.push('suggestions');
    for (const s of open) lines.push(`  ${suggestionLine(s)}`);
    if (orphans > 0)
      lines.push(`  ${plural(orphans, 'orphaned suggestion')} (anchor or notes gone; never shown)`);
  }
  return lines;
}

// One open suggestion: a note by its kind, words, side and anchor; a context by its name and notes; then who and why.
// A suggestion read from an api older than contexts carries no `type`: it is a note.
function suggestionLine(s: StormSuggestion): string {
  const gap = s.type !== 'context' && s.gap ? `gap ${s.gap}` : null;
  const facts = [gap, s.by ? `by ${s.by}` : null].filter(Boolean);
  const what =
    s.type === 'context'
      ? `context "${s.name}" ${s.noteRefs.join(',')}`
      : `${KIND_WORD[s.kind]} "${s.words}" ${s.side} ${s.anchorRef}`;
  return `${s.ref} ${what}${facts.length ? ` · ${facts.join(' · ')}` : ''}${s.reason ? `: ${s.reason}` : ''}`;
}
