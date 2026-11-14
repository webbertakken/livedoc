// The storm view (docs/specs/021-event-storming/board-reading.md "Output"): the reading as compact text. The About,
// one line per note in timeline order (a pivotal event marked so, an answered hotspot with its answer), the loose
// notes, the lanes, the contexts and their map, the gaps, the open suggestions, suggested changes and lane plan, and
// what was declined. Refs name every note, so an agent can address any of them in an edit operation.

import type { ElementId, EventStormingNoteKind } from '@livedoc/document';
import type { StormDeclined } from './declined';
import type { StormLanePlan } from './lanes/view';
import type { StormNoteChange, StormSuggestedChange } from './suggested-changes';
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

// What the view lists beside the reading and its suggested notes and contexts: the changes suggested to what is on
// the board, the open lane plan, and what a person dismissed before.
export type StormViewExtras = {
  changes?: readonly StormSuggestedChange[];
  plan?: StormLanePlan | null;
  declined?: readonly StormDeclined[];
};

export function formatStormView(
  reading: StormReading,
  suggestions: readonly StormSuggestion[],
  { changes = [], plan = null, declined = [] }: StormViewExtras = {},
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
      // Every open suggestion counts alike: notes, contexts, names, note changes and a lane plan.
      plural(open.length + changes.length + (plan ? 1 : 0), 'suggestion'),
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

  if (changes.length > 0) {
    lines.push('suggested changes');
    for (const c of changes) lines.push(`  ${changeLine(c)}`);
  }

  if (plan) lines.push('lane plan', `  ${planLine(plan)}`);

  if (declined.length > 0) {
    lines.push('declined');
    for (const d of declined)
      lines.push(
        `  ${d.type}${d.kind ? ` ${d.kind}` : ''}${d.words ? ` "${d.words}"` : ''} ${d.aboutRefs.join(',')}`,
      );
  }
  return lines;
}

// What a note change proposes, as its edit operation says it.
function noteChangeText(c: StormNoteChange): string {
  switch (c.change) {
    case 'reword':
      return `reword "${c.words}"${c.term ? ` (term "${c.term}" -> "${c.to}")` : ''}`;
    case 'kind':
      return `kind ${c.kind}`;
    case 'split':
      return `split ${c.parts.map((part) => `"${part}"`).join(' | ')}`;
    case 'remove':
      return 'remove';
  }
}

// One suggested change: the refs it is on (a note, a context, or the contexts a name would merge), what it proposes,
// then who and why.
function changeLine(c: StormSuggestedChange): string {
  const what =
    c.type === 'name'
      ? `${c.contextRefs.join(',')} name "${c.name}"`
      : `${c.noteRef} ${noteChangeText(c)}`;
  return `${what}${c.by ? ` · by ${c.by}` : ''}${c.reason ? `: ${c.reason}` : ''}`;
}

// The open lane plan (docs/specs/021-event-storming/lane-plans.md): its ref, its lanes top to bottom with how many
// notes each holds, whether the board changed since it was made, then who and why.
function planLine(plan: StormLanePlan): string {
  const lanes = plan.lanes.map((lane) => `"${lane.name}" ${plural(lane.notes, 'note')}`).join(', ');
  const facts = [
    plan.stale ? 'stale (the board changed since it was made)' : null,
    plan.by ? `by ${plan.by}` : null,
  ].filter(Boolean);
  const said = [`${plan.ref} ${plural(plan.lanes.length, 'lane')}: ${lanes}`, ...facts].join(' · ');
  return `${said}${plan.reason ? `: ${plan.reason}` : ''}`;
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
