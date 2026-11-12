// The storm view (docs/specs/021-event-storming/board-reading.md "Output"): the reading as compact text, one line per
// note in timeline order, then the loose notes, the gaps and the open suggestions. Refs name every note, so an
// agent can address any of them in an edit operation.

import type { ElementId, EventStormingNoteKind } from '@livedoc/document';
import type { StormSuggestion } from './suggestions';
import type { StormNote, StormReading } from './types';

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatStormView(
  reading: StormReading,
  suggestions: readonly StormSuggestion[],
): string[] {
  const byId = new Map<ElementId, StormNote>(reading.notes.map((n) => [n.id, n]));
  const say = (id: ElementId) => {
    const n = byId.get(id)!;
    return `${KIND_WORD[n.kind]} ${n.ref} "${n.words}"`;
  };
  const open = suggestions.filter((s) => !s.orphan);
  const orphans = suggestions.length - open.length;
  const lines = [
    [
      `board "${reading.board.name}"`,
      plural(reading.notes.length, 'note'),
      plural(reading.timeline.length, 'event'),
      plural(reading.chains.length, 'chain'),
      plural(reading.gaps.length, 'gap'),
      plural(open.length, 'suggestion'),
    ].join(' · '),
  ];
  if (reading.notes.length === 0) lines.push('no notes');

  if (reading.timeline.length > 0) lines.push('timeline');
  reading.timeline.forEach((m, i) => {
    lines.push(`${i + 1} ${say(m.event)}`);
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
    for (const s of open) {
      const facts = [s.gap ? `gap ${s.gap}` : null, s.by ? `by ${s.by}` : null].filter(Boolean);
      lines.push(
        `  ${s.ref} ${KIND_WORD[s.kind]} "${s.words}" ${s.side} ${s.anchorRef}${facts.length ? ` · ${facts.join(' · ')}` : ''}${s.reason ? `: ${s.reason}` : ''}`,
      );
    }
    if (orphans > 0)
      lines.push(`  ${plural(orphans, 'orphaned suggestion')} (anchor gone; never shown)`);
  }
  return lines;
}
