// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import type { NoteStructureMenu } from '@/lib/note-structure-menu';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps } from './EditorContextMenu.types';

// docs/specs/021-event-storming/board-structure.md "Pivotal events", "Hotspot answers": a domain event's menu marks
// it pivotal or unmarks it, a hotspot's opens its answer, and each gets the menu out of the way.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const note: Element = {
  id: 'n',
  type: 'sticky',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  label: 'Order Placed',
  esKind: 'domain-event',
};

function open(noteStructure: NoteStructureMenu | undefined) {
  const onClose = vi.fn();
  const given: Record<string, unknown> = {
    menu: { mode: 'element', elementId: note.id, x: 10, y: 10 },
    elements: [note],
    layers: [],
    theme: undefined,
    noteContexts: undefined,
    onAskAbout: undefined,
    noteStructure,
    onClose,
  };
  const props = new Proxy(given, {
    get: (t, k: string) => (k in t ? t[k] : vi.fn()),
    has: () => true,
  }) as unknown as EditorContextMenuProps;
  const Host = () => EditorContextMenu(props);
  render(<Host />);
  return onClose;
}

const row = (name: string) => screen.queryByRole('button', { name });
const lane = (named = false) => ({ named, onName: vi.fn<() => void>() });

describe('a workshop note’s menu and the board’s structure', () => {
  it('marks a domain event pivotal and closes the menu', () => {
    const onToggle = vi.fn();
    const onClose = open({ pivotal: { on: false, onToggle }, answer: null, lane: lane() });
    fireEvent.click(row('Mark as Pivotal')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(row('Unmark Pivotal')).toBeNull();
    expect(row('Answer…')).toBeNull();
  });

  it('offers Unmark Pivotal on a pivotal event', () => {
    const onToggle = vi.fn();
    open({ pivotal: { on: true, onToggle }, answer: null, lane: lane() });
    expect(row('Mark as Pivotal')).toBeNull();
    fireEvent.click(row('Unmark Pivotal')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('opens an open hotspot’s answer and closes the menu', () => {
    const onOpen = vi.fn();
    const onClose = open({ pivotal: null, answer: { answered: false, onOpen }, lane: lane() });
    fireEvent.click(row('Answer…')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(row('Mark as Pivotal')).toBeNull();
  });

  it('offers Edit Answer… on an answered hotspot', () => {
    const onOpen = vi.fn();
    open({ pivotal: null, answer: { answered: true, onOpen }, lane: lane() });
    expect(row('Answer…')).toBeNull();
    fireEvent.click(row('Edit Answer…')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('names the lane the note stands on, and closes the menu', () => {
    const named = lane();
    const onClose = open({ pivotal: null, answer: null, lane: named });
    fireEvent.click(row('Name This Lane')!);
    expect(named.onName).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers Rename This Lane on a lane that has a name', () => {
    const named = lane(true);
    open({ pivotal: null, answer: null, lane: named });
    expect(row('Name This Lane')).toBeNull();
    fireEvent.click(row('Rename This Lane')!);
    expect(named.onName).toHaveBeenCalledTimes(1);
  });

  it('holds no structure row for someone who may not change the structure', () => {
    open(undefined);
    for (const name of [
      'Mark as Pivotal',
      'Unmark Pivotal',
      'Answer…',
      'Edit Answer…',
      'Name This Lane',
      'Rename This Lane',
    ])
      expect(row(name)).toBeNull();
  });
});
