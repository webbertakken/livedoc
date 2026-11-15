import { EVENT_STORMING_NOTES, type EventStormingNoteKind } from '@livedoc/document';
import type { GapLevel, StormGap, StormReading } from '@livedoc/storm-reading';

// The Check tab's rows (docs/specs/021-event-storming/board-review.md "Check"): the gaps the reading finds, for a
// person, grouped by level in the reading's order. A row names its note and says the gap in the reading's own words;
// a gap with a remedy offers Add, an open hotspot Answer. Pure.

export type CheckAct =
  // A blank note of the remedy's kind, where the remedy says.
  { type: 'add'; kind: EventStormingNoteKind; label: string } | { type: 'answer'; label: string };

export type CheckRow = {
  // Stable while the gap stands.
  id: string;
  gap: StormGap;
  // The kind of the note the gap is about: the hue its row is told in.
  kind: EventStormingNoteKind;
  // The note's words, or what stands for a note with none.
  words: string;
  // What the gap says of it.
  says: string;
  act: CheckAct | null;
};

export type CheckGroup = { level: GapLevel; title: string; rows: CheckRow[] };

export const GAP_LEVEL_TITLES: Record<GapLevel, string> = {
  flow: 'The story has a hole',
  notation: 'The grammar slipped',
  question: 'Left open',
};
const LEVELS: readonly GapLevel[] = ['flow', 'notation', 'question'];

const kindName = (kind: EventStormingNoteKind) =>
  EVENT_STORMING_NOTES.find((n) => n.kind === kind)!.label.toLowerCase();
const withArticle = (name: string) => `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function checkGroups(reading: StormReading): CheckGroup[] {
  const notes = new Map(reading.notes.map((n) => [n.id, n]));
  const rowOf = (gap: StormGap): CheckRow => {
    const note = notes.get(gap.ids[0]!)!;
    const blank = `a blank ${kindName(note.kind)}`;
    const words = note.words || capitalised(blank);
    // The reading's message leads with the note; the row names it apart, so the rest is what the gap says.
    const lead = note.words ? `"${note.words}"` : blank;
    const says = capitalised(gap.message.slice(lead.length).replace(/^:?\s*/, ''));
    const remedy = gap.remedy;
    const act: CheckAct | null =
      gap.code === 'open_hotspot'
        ? { type: 'answer', label: `Answer: ${words}` }
        : remedy
          ? {
              type: 'add',
              kind: remedy.kind,
              label: `Add ${withArticle(kindName(remedy.kind))} ${remedy.side} ${words}`,
            }
          : null;
    return { id: `${gap.code}:${gap.ids.join(',')}`, gap, kind: note.kind, words, says, act };
  };
  return LEVELS.map((level) => ({
    level,
    title: GAP_LEVEL_TITLES[level],
    rows: reading.gaps.filter((g) => g.level === level).map(rowOf),
  })).filter((group) => group.rows.length > 0);
}
