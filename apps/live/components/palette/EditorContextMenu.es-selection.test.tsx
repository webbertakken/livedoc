// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps } from './EditorContextMenu.types';

// docs/specs/021-event-storming/candidate-contexts.md "The board's element menu": on an Event Storming board the menu
// for a selection of several holds Text and New Context, and nothing else.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const note = (id: string, x: number): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
});

function open(extra: Record<string, unknown>) {
  const onClose = vi.fn();
  const selection = [note('a', 0), note('b', 300)];
  const given: Record<string, unknown> = {
    menu: { mode: 'multi', x: 10, y: 10 },
    elements: selection,
    selectionElements: selection,
    layers: [],
    theme: undefined,
    onClose,
    ...extra,
  };
  const props = new Proxy(given, {
    get: (t, k: string) => (k in t ? t[k] : vi.fn()),
    has: () => true,
  }) as unknown as EditorContextMenuProps;
  const Host = () => EditorContextMenu(props);
  render(<Host />);
  return onClose;
}

const rows = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter(Boolean);

describe('a selection’s menu on an Event Storming board', () => {
  it('holds Text and New Context alone, and New Context makes one', () => {
    const onNewContext = vi.fn();
    const onClose = open({ esBoard: true, onNewContext });
    expect(rows()).toEqual(['Text', 'New Context']);
    fireEvent.click(screen.getByRole('button', { name: 'New Context' }));
    expect(onNewContext).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no New Context where the session may not make one', () => {
    open({ esBoard: true, onNewContext: undefined });
    expect(rows()).toEqual(['Text']);
  });
});
