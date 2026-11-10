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
  it('is a named toolbar: the name, the active tab, the stack, then Add tab', () => {
    renderGroup();
    const group = screen.getByRole('toolbar', { name: 'Document' });
    expect(group.getAttribute('data-region')).toBe('tabs');
    const names = [...group.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).toEqual([
      'Private',
      'Product discovery',
      'Checkout flow',
      'Tab menu',
      'All tabs (3)',
      'Add tab',
    ]);
  });

  it('draws the active tab as a tinted segment, never a bordered pill', () => {
    renderGroup();
    const segment = document.querySelector<HTMLElement>('[data-tour-id="active-tab"]')!;
    expect(segment.className).not.toMatch(/(^|\s)border(\s|-)/);
    expect(segment.style.boxShadow).toContain('inset');
  });

  it('renames the active tab in place from a click on its name, for someone who may', () => {
    const { props } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout flow' }));
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
    expect(screen.queryByRole('button', { name: 'Checkout flow' })).toBeNull();
    expect(screen.getByText('Checkout flow')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All tabs (3)' })).toBeTruthy();
  });

  it('shows the stack with one tab too, so nothing moves as tabs come and go', () => {
    renderGroup((p) => {
      p.tabs.tabs = [tab('b', 'Checkout flow')];
    });
    expect(screen.getByRole('button', { name: 'All tabs (1)' })).toBeTruthy();
  });

  it('counts the tabs in a tab-scoped session’s scope', () => {
    renderGroup((p) => {
      p.tabs.isOutOfScope = (id) => id === 'c';
    });
    expect(screen.getByRole('button', { name: 'All tabs (2)' })).toBeTruthy();
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
    const stack = screen.getByRole('button', { name: 'All tabs (3)' });
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
});
