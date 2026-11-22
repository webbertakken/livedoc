// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPinnedArrow, createShape, type Element } from '@livedoc/document';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps, MindSelectionMenu } from './EditorContextMenu.types';

// docs/specs/009-elements/mind-node.md "Several nodes selected": the menu of several mind nodes, the line between them
// carried along, holds the Mind Map row, with Tidy Branches in its Outline.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const node = (id: string, parent?: string): Element => ({
  ...createShape('mind-node', 0, 0),
  id,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' as const }),
});
const selection: Element[] = [
  node('r'),
  node('a', 'r'),
  { ...createPinnedArrow('r', 'e', 'a', 'w'), id: 'r-a' },
];

function open(mindSelection: MindSelectionMenu | undefined) {
  const given: Record<string, unknown> = {
    menu: { mode: 'multi', x: 10, y: 10 },
    elements: selection,
    selectionElements: selection,
    layers: [],
    theme: undefined,
    esBoard: false,
    mindSelection,
  };
  const props = new Proxy(given, {
    get: (t, k: string) => (k in t ? t[k] : vi.fn()),
    has: () => true,
  }) as unknown as EditorContextMenuProps;
  const Host = () => EditorContextMenu(props);
  render(<Host />);
}

const mindSelection = (): MindSelectionMenu => ({
  flowRows: ['tree', 'downward'],
  flow: null,
  spacing: 'comfortable',
  onTidyBranches: vi.fn(),
  onSelectBranch: vi.fn(),
  onSelectMap: vi.fn(),
});

describe('the menu of several mind nodes', () => {
  it('holds the Mind Map row, whose Outline offers Tidy Branches', () => {
    const menu = mindSelection();
    open(menu);
    fireEvent.click(screen.getByRole('button', { name: /Mind Map/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Outline/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tidy Branches/ }));
    expect(menu.onTidyBranches).toHaveBeenCalledTimes(1);
  });

  it('holds no Mind Map row for any other selection', () => {
    open(undefined);
    expect(screen.queryByRole('button', { name: /Mind Map/ })).toBeNull();
  });
});
