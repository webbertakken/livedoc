import { describe, expect, it } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import { readBoard } from '@livedoc/storm-reading';
import { checkGroups } from './review-rows';

// The Check tab's rows (docs/specs/021-event-storming/board-review.md "Check").

const note = (id: string, esKind: string, label: string, x: number, y = 0): Element =>
  ({
    id,
    type: 'sticky',
    x,
    y,
    width: 200,
    height: 200,
    label,
    esKind,
    fixedSize: true,
  }) as Element;

const read = (...elements: Element[]) =>
  readBoard({ id: 't', name: 'Kitchen', kind: 'event-storming', elements } as Tab);

describe('checkGroups', () => {
  const groups = checkGroups(
    read(
      note('bill', 'command', 'Present bill', 0),
      note('paid', 'domain-event', 'Guest paid', 216),
      note('cleared', 'domain-event', 'Table cleared', 648),
      note('blank', 'policy', '', 1080),
      note('back', 'hotspot', 'What if an order is sent back?', 864, -240),
    ),
  );
  const rows = (level: string) => groups.find((g) => g.level === level)?.rows ?? [];
  const row = (id: string) => groups.flatMap((g) => g.rows).find((r) => r.id.startsWith(id))!;

  it('groups the gaps by level, flow first, each under its title', () => {
    expect(groups.map((g) => [g.level, g.title])).toEqual([
      ['flow', 'The story has a hole'],
      ['notation', 'The grammar slipped'],
      ['question', 'Left open'],
    ]);
  });

  it('names the note and says the gap in a sentence of its own', () => {
    expect(row('event_without_cause')).toMatchObject({
      kind: 'domain-event',
      words: 'Table cleared',
      says: 'Nothing on the board makes it happen',
    });
    expect(row('open_hotspot')).toMatchObject({
      words: 'What if an order is sent back?',
      says: 'Is still open',
    });
  });

  it('offers Add where the gap has a remedy, saying what lands where', () => {
    expect(row('event_without_cause').act).toEqual({
      type: 'add',
      kind: 'command',
      label: 'Add a command before Table cleared',
    });
    expect(row('command_without_trigger').act).toEqual({
      type: 'add',
      kind: 'actor',
      label: 'Add an actor above Present bill',
    });
  });

  it('offers Answer on an open hotspot, and nothing where there is no remedy', () => {
    expect(row('open_hotspot').act).toEqual({
      type: 'answer',
      label: 'Answer: What if an order is sent back?',
    });
    expect(row('blank_note').act).toBeNull();
  });

  it('stands a blank note’s kind in for its words', () => {
    expect(row('blank_note')).toMatchObject({ words: 'A blank policy', says: 'Has no words' });
    expect(rows('notation').map((r) => r.gap.code)).toContain('blank_note');
  });

  it('leaves out a level with no gap, and answers nothing for a board that holds', () => {
    expect(checkGroups(read())).toEqual([]);
    const flowOnly = checkGroups(read(note('cleared', 'domain-event', 'Table cleared', 0)));
    expect(flowOnly.map((g) => g.level)).toEqual(['flow']);
  });
});
