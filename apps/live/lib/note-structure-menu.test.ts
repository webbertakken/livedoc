import { describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { noteStructureMenu } from './note-structure-menu';

// What a workshop note's menu offers about the board's structure (docs/specs/021-event-storming/board-structure.md
// "Pivotal events", "Lane names", "Hotspot answers").

const note = (id: string, esKind: string, extra: Record<string, unknown> = {}): Element =>
  ({
    id,
    type: 'sticky',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    label: id,
    esKind,
    ...extra,
  }) as Element;

const board: Element[] = [
  note('placed', 'domain-event'),
  note('shipped', 'domain-event', { esPivotal: true }),
  note('place', 'command'),
  note('why', 'hotspot'),
  note('who', 'hotspot', { esAnswer: 'The chef.' }),
  { id: 'text', type: 'text', x: 0, y: 0, width: 10, height: 10, label: 'Lane' },
];

const acts = () => ({
  setPivotal: vi.fn<(id: string, on: boolean) => void>(),
  openAnswer: vi.fn<(id: string) => void>(),
  nameLane: vi.fn<(id: string) => void>(),
});

describe('noteStructureMenu', () => {
  it('offers Mark as Pivotal on a domain event, and marks it', () => {
    const a = acts();
    const menu = noteStructureMenu(board, 'placed', a)!;
    expect(menu.answer).toBeNull();
    expect(menu.pivotal!.on).toBe(false);
    menu.pivotal!.onToggle();
    expect(a.setPivotal).toHaveBeenCalledWith('placed', true);
  });

  it('offers Unmark Pivotal on a pivotal event', () => {
    const a = acts();
    const menu = noteStructureMenu(board, 'shipped', a)!;
    expect(menu.pivotal!.on).toBe(true);
    menu.pivotal!.onToggle();
    expect(a.setPivotal).toHaveBeenCalledWith('shipped', false);
  });

  it('offers Answer on a hotspot, saying whether it is answered', () => {
    const a = acts();
    const open = noteStructureMenu(board, 'why', a)!;
    expect(open.pivotal).toBeNull();
    expect(open.answer!.answered).toBe(false);
    open.answer!.onOpen();
    expect(a.openAnswer).toHaveBeenCalledWith('why');
    expect(noteStructureMenu(board, 'who', a)!.answer!.answered).toBe(true);
  });

  it('offers Name This Lane on any workshop note, and no other row on a note of another kind', () => {
    const a = acts();
    const menu = noteStructureMenu(board, 'place', a)!;
    expect(menu.pivotal).toBeNull();
    expect(menu.answer).toBeNull();
    expect(menu.lane.named).toBe(false);
    menu.lane.onName();
    expect(a.nameLane).toHaveBeenCalledWith('place');
  });

  it('says the lane has a name when a text left of the wall names it', () => {
    const named: Element[] = [
      ...board,
      { id: 'lane', type: 'text', x: -200, y: 84, width: 180, height: 32, label: 'Floor' },
    ];
    expect(noteStructureMenu(named, 'place', acts())!.lane.named).toBe(true);
  });

  it('offers nothing on what is no note, or on one that is gone', () => {
    const a = acts();
    expect(noteStructureMenu(board, 'text', a)).toBeNull();
    expect(noteStructureMenu(board, 'gone', a)).toBeNull();
  });
});
