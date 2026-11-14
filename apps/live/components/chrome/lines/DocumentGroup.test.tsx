// @vitest-environment jsdom

// The document group, the bottom line's right (docs/specs/007-editor/toolbar-layout.md "The bottom line"): the
// document's name, the active tab, the tab stack, the contributors, Add tab.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import type { Participant } from '@/lib/identity';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));
// jsdom lays nothing out: a fixed spot keeps the tab menu's placement settled, as the menu's own tests do.
const SPOT = vi.hoisted(() => ({ x: 0, y: 0 }));
vi.mock('@/lib/clamp-to-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clamp-to-viewport')>()),
  clampToViewport: () => SPOT,
}));

const { DocumentGroup } = await import('./DocumentGroup');

afterEach(() => {
  cleanup();
  track.mockClear();
});

const tab = (id: string, name: string, extra: Partial<Tab> = {}): Tab => ({
  id,
  name,
  elements: [],
  ...extra,
});
const person = (id: string, name: string): Participant =>
  ({ id, name, color: '#7c3aed' }) as unknown as Participant;

const TABS = [tab('a', 'Overview'), tab('b', 'Checkout flow'), tab('c', 'Roadmap')];

type Props = ComponentProps<typeof DocumentGroup>;
function base(): Props {
  return {
    name: {
      documentName: 'Product discovery',
      showShare: true,
      shareable: false,
      onOpenShare: vi.fn(),
      onRename: vi.fn(),
    },
    tabs: {
      tabs: TABS,
      activeId: 'b',
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRename: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      canDeleteDocument: true,
      onDeleteDocument: vi.fn(),
      isTabLoaded: () => true,
      onMoveTabToFolder: vi.fn(),
      onRemoveTabFromFolder: vi.fn(),
      onRenameFolder: vi.fn(),
      activeTabHasContent: false,
      onClearContent: vi.fn(),
      onImportTab: vi.fn(),
      onExportTab: vi.fn(),
      otherDocuments: [],
      onCopyTabTo: vi.fn(),
      onToggleLockTab: vi.fn(),
      onReorder: vi.fn(),
      participantsByTab: new Map(),
      selfId: 'me',
      selfRole: 'edit',
    },
  };
}
const renderGroup = (edit: (p: Props) => void = () => {}) => {
  const props = base();
  edit(props);
  return { props, ...render(<DocumentGroup {...props} />) };
};

describe('DocumentGroup', () => {
  it('is a named toolbar: the name, the active tab with its stack, then Add tab', () => {
    renderGroup();
    const group = screen.getByRole('toolbar', { name: 'Document' });
    expect(group.getAttribute('data-region')).toBe('tabs');
    const names = [...group.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).toEqual([
      'Private',
      'Product discovery',
      'Rename tab',
      'Checkout flow, all tabs (3)',
      'Tab menu',
      'Add tab',
    ]);
  });

  it('draws the active tab as a tinted segment, never a bordered pill', () => {
    renderGroup();
    const segment = document.querySelector<HTMLElement>('[data-tour-id="active-tab"]')!;
    expect(segment.className).not.toMatch(/(^|\s)border(\s|-)/);
    expect(segment.style.boxShadow).toContain('inset');
  });

  it('holds the tab stack inside the active tab: its name, glyph and count are one button', () => {
    renderGroup();
    const segment = document.querySelector<HTMLElement>('[data-tour-id="active-tab"]')!;
    const stack = screen.getByRole('button', { name: 'Checkout flow, all tabs (3)' });
    expect(segment.contains(stack)).toBe(true);
    expect(stack.textContent).toBe('Checkout flow3');
    expect(stack.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('opens the tab list from a click on the active tab’s name', () => {
    renderGroup();
    fireEvent.click(screen.getByText('Checkout flow'));
    expect(screen.getByRole('dialog', { name: 'Tabs' })).toBeTruthy();
    expect(screen.queryByDisplayValue('Checkout flow')).toBeNull();
  });

  it('renames the active tab in place from its kind glyph, for someone who may', () => {
    const { props } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Rename tab' }));
    const field = screen.getByDisplayValue('Checkout flow');
    fireEvent.change(field, { target: { value: 'Checkout' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.tabs.onRename).toHaveBeenCalledWith('b', 'Checkout');
  });

  it('opens the active tab rename for a command palette request', () => {
    const props = base();
    const { rerender } = render(<DocumentGroup {...props} />);
    expect(screen.queryByDisplayValue('Checkout flow')).toBeNull();
    rerender(<DocumentGroup {...props} tabs={{ ...props.tabs, renameActiveNonce: 1 }} />);
    expect(screen.getByDisplayValue('Checkout flow')).toBeTruthy();
  });

  it('for a Participant or a Viewer: no rename, no tab menu, no Add tab; the stack still lists', () => {
    renderGroup((p) => {
      p.tabs.readOnly = true;
      p.name.readOnly = true;
      p.name.showShare = false;
    });
    expect(screen.queryByRole('button', { name: 'Tab menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add tab' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename tab' })).toBeNull();
    expect(screen.getByText('Checkout flow')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Checkout flow, all tabs (3)' })).toBeTruthy();
  });

  it('shows the stack with one tab too, so nothing moves as tabs come and go', () => {
    renderGroup((p) => {
      p.tabs.tabs = [tab('b', 'Checkout flow')];
    });
    expect(screen.getByRole('button', { name: 'Checkout flow, all tabs (1)' })).toBeTruthy();
  });

  it('keeps the tab stack while no tab is active, named for the tabs', () => {
    renderGroup((p) => {
      p.tabs.activeId = 'gone';
    });
    expect(screen.getByRole('button', { name: 'Tabs, all tabs (3)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename tab' })).toBeNull();
  });

  it('counts the tabs in a tab-scoped session’s scope', () => {
    renderGroup((p) => {
      p.tabs.isOutOfScope = (id) => id === 'c';
    });
    expect(screen.getByRole('button', { name: 'Checkout flow, all tabs (2)' })).toBeTruthy();
  });

  it('adds a tab, or a Board, from the add menu', () => {
    const { props } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tab' }));
    expect(props.tabs.onAdd).toHaveBeenCalledWith('tab');
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Board' }));
    expect(props.tabs.onAdd).toHaveBeenLastCalledWith('board');
  });

  it('draws no contributors while nobody else is here', () => {
    renderGroup((p) => {
      p.tabs.participantsByTab = new Map([['b', [person('me', 'Me')]]]);
    });
    expect(screen.queryByRole('button', { name: /people here|person here/ })).toBeNull();
  });

  it('shows up to three contributors, then +N, everyone else in the document once', () => {
    renderGroup((p) => {
      p.tabs.participantsByTab = new Map([
        ['a', [person('p1', 'Ann'), person('p2', 'Bo')]],
        ['b', [person('me', 'Me'), person('p3', 'Cy')]],
        ['c', [person('p4', 'Di'), person('p5', 'Ed')]],
      ]);
    });
    const button = screen.getByRole('button', { name: '5 people here' });
    expect(button.querySelectorAll('[data-contributor]')).toHaveLength(3);
    expect(button.textContent).toContain('+2');
  });

  it('opens the same tab list from the stack and from the contributors, counting which', () => {
    renderGroup((p) => {
      p.tabs.participantsByTab = new Map([['a', [person('p1', 'Ann')]]]);
    });
    const stack = screen.getByRole('button', { name: 'Checkout flow, all tabs (3)' });
    fireEvent.click(stack);
    expect(stack.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Tabs' })).toBeTruthy();
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TabListStack');
    const people = screen.getByRole('button', { name: '1 person here' });
    fireEvent.click(people);
    expect(people.getAttribute('aria-expanded')).toBe('true');
    expect(stack.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('dialog', { name: 'Tabs' })).toHaveLength(1);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TabListPeople');
    act(() => {
      fireEvent.click(people);
    });
    expect(screen.queryByRole('dialog', { name: 'Tabs' })).toBeNull();
  });
  it('cancels a rename with Escape, keeping the name', () => {
    const { props } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Rename tab' }));
    fireEvent.keyDown(screen.getByDisplayValue('Checkout flow'), { key: 'Escape' });
    expect(screen.queryByDisplayValue('Checkout flow')).toBeNull();
    expect(props.tabs.onRename).not.toHaveBeenCalled();
  });

  it('opens and closes the active tab\u2019s menu from its \u22ef and a right-click', () => {
    renderGroup();
    const menuButton = screen.getByRole('button', { name: 'Tab menu' });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.contextMenu(document.querySelector('[data-tour-id="active-tab"]')!);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('keeps a press inside the group from reaching the canvas', () => {
    renderGroup();
    const group = screen.getByRole('toolbar', { name: 'Document' });
    const outside = vi.fn();
    document.addEventListener('pointerdown', outside);
    fireEvent.pointerDown(group);
    document.removeEventListener('pointerdown', outside);
    expect(outside).not.toHaveBeenCalled();
  });

  it('opens the tab menu at the canvas\u2019s right-click point', async () => {
    renderGroup((p) => {
      p.tabs.canvasMenu = { x: 40, y: 40 };
      p.tabs.onCloseCanvasMenu = vi.fn();
      p.tabs.canvasActions = { onPaste: vi.fn(), canPaste: false };
    });
    expect(await screen.findByRole('button', { name: 'Rename' })).toBeTruthy();
  });
  it('keeps the name when a rename commits a blank one', () => {
    const { props } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Rename tab' }));
    const field = screen.getByDisplayValue('Checkout flow');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.tabs.onRename).toHaveBeenCalledWith('b', 'Checkout flow');
  });

  it('marks a locked active tab with its padlock', () => {
    renderGroup((p) => {
      p.tabs.tabs = [tab('a', 'Overview'), tab('b', 'Checkout flow', { locked: true })];
    });
    const segment = document.querySelector<HTMLElement>('[data-tour-id="active-tab"]')!;
    expect(segment.querySelectorAll('svg').length).toBeGreaterThan(2);
  });

  it('closes the tab menu and the tab list on a press outside them', () => {
    const now = vi.spyOn(performance, 'now');
    renderGroup();
    const menuButton = screen.getByRole('button', { name: 'Tab menu' });
    now.mockReturnValue(0);
    fireEvent.click(menuButton);
    now.mockReturnValue(10_000);
    fireEvent.pointerDown(document.body);
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Checkout flow, all tabs (3)' }));
    expect(screen.getByRole('dialog', { name: 'Tabs' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Tabs' })).toBeNull();
    now.mockRestore();
  });

  it('closes a list the contributors opened once nobody else is here', () => {
    const props = base();
    props.tabs.participantsByTab = new Map([['a', [person('p1', 'Ann')]]]);
    const { rerender } = render(<DocumentGroup {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '1 person here' }));
    expect(screen.getByRole('dialog', { name: 'Tabs' })).toBeTruthy();
    rerender(<DocumentGroup {...props} tabs={{ ...props.tabs, participantsByTab: new Map() }} />);
    expect(screen.queryByRole('dialog', { name: 'Tabs' })).toBeNull();
  });
  it('renames from the tab menu\u2019s Rename too, closing the menu', () => {
    renderGroup();
    const menuButton = screen.getByRole('button', { name: 'Tab menu' });
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByDisplayValue('Checkout flow')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tab menu' })).toBeNull();
  });
});
