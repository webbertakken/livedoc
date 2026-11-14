// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps, NoteContextsMenu } from './EditorContextMenu.types';

// docs/specs/021-event-storming/candidate-contexts.md "Its notes change two ways": a workshop note's menu offers Add
// to Context (the board's kept contexts by name, the one it is in checked) and Remove from Context when it is in one.
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
  label: 'Paid',
  esKind: 'domain-event',
};

function open(noteContexts: NoteContextsMenu | undefined) {
  const onClose = vi.fn();
  const given: Record<string, unknown> = {
    menu: { mode: 'element', elementId: note.id, x: 10, y: 10 },
    elements: [note],
    layers: [],
    theme: undefined,
    noteContexts,
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

const menuOf = (currentId: string | null): NoteContextsMenu => ({
  contexts: [
    { id: 'b', name: 'Billing' },
    { id: 'm', name: 'Members' },
  ],
  currentId,
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onCreate: vi.fn(),
});

describe('a workshop note’s menu and its candidate context', () => {
  it('adds the note to a context by name, the one it is in not offered', () => {
    const menu = menuOf('m');
    const onClose = open(menu);
    fireEvent.click(screen.getByRole('button', { name: /Add to Context/ }));
    expect(screen.getByText('Members').closest('[aria-disabled]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(menu.onAdd).toHaveBeenCalledWith('b');
    expect(onClose).toHaveBeenCalled();
  });

  it('makes a new context round it', () => {
    const menu = menuOf(null);
    open(menu);
    fireEvent.click(screen.getByRole('button', { name: 'New Context' }));
    expect(menu.onCreate).toHaveBeenCalledTimes(1);
  });

  it('removes it from its context', () => {
    const menu = menuOf('b');
    open(menu);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Context' }));
    expect(menu.onRemove).toHaveBeenCalledTimes(1);
  });

  it('offers no Remove for a note in no context, and nothing when there is nothing to offer', () => {
    open(menuOf(null));
    expect(screen.queryByRole('button', { name: 'Remove from Context' })).toBeNull();
    cleanup();
    open({ ...menuOf(null), contexts: [] });
    expect(screen.queryByRole('button', { name: /Add to Context/ })).toBeNull();
    cleanup();
    open(undefined);
    expect(screen.queryByRole('button', { name: /Add to Context/ })).toBeNull();
  });
});
