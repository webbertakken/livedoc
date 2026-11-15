// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps } from './EditorContextMenu.types';

// docs/specs/021-event-storming/asks.md "Where an ask starts": a workshop note's menu holds Ask…, which opens the Ask
// popover about the note and gets the menu out of the way.
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
const plain: Element = {
  id: 'p',
  type: 'sticky',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  label: 'Hi',
};

function open(target: Element, onAskAbout: (() => void) | undefined) {
  const onClose = vi.fn();
  const given: Record<string, unknown> = {
    menu: { mode: 'element', elementId: target.id, x: 10, y: 10 },
    elements: [target],
    layers: [],
    theme: undefined,
    noteContexts: undefined,
    onAskAbout,
    noteStructure: undefined,
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

describe('a workshop note’s menu and asking', () => {
  it('opens the Ask popover about the note and closes the menu', () => {
    const onAskAbout = vi.fn();
    const onClose = open(note, onAskAbout);
    fireEvent.click(screen.getByRole('button', { name: 'Ask…' }));
    expect(onAskAbout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('holds no Ask… for someone who may not ask', () => {
    open(note, undefined);
    expect(screen.queryByRole('button', { name: 'Ask…' })).toBeNull();
  });

  it('holds no Ask… on a note that is not a workshop note', () => {
    open(plain, vi.fn());
    expect(screen.queryByRole('button', { name: 'Ask…' })).toBeNull();
  });
});
