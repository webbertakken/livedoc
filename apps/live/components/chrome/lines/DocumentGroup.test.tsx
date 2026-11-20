// @vitest-environment jsdom

// The document group, the bottom line's right (docs/specs/007-editor/toolbar-layout.md "The bottom line"): the
// document's name, the active tab, the tab stack, the contributors, Add tab.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
      'Rename Diagram tab',
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
    fireEvent.click(screen.getByRole('button', { name: 'Rename Diagram tab' }));
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
    expect(screen.queryByRole('button', { name: 'Rename Diagram tab' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: 'Rename Diagram tab' })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Rename Diagram tab' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Rename Diagram tab' }));
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
  // docs/specs/029-sheets/spreadsheet.md "The workbook shape": a spreadsheet's tabs are its sheet bar, at the foot of
  // the grid, never at the top; no tab of another kind is offered.
  it('leaves a spreadsheet’s tabs to its sheet bar: no active tab, no stack, no Add tab', () => {
    const props = base();
    props.tabs.spreadsheet = true;
    render(<DocumentGroup {...props} />);
    expect(screen.getByRole('toolbar', { name: 'Document' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add tab' })).toBeNull();
    expect(screen.queryByRole('button', { name: /all tabs/ })).toBeNull();
  });

  // docs/specs/006-document/kinds-outside-the-canvas.md "The tab strip": a document whose one tab is outside the canvas
  // hides its active tab segment and keeps Add tab; two tabs, or one canvas tab, show it.
  it('hides the active tab of a document whose one tab is a text document, keeping Add tab', () => {
    const props = base();
    props.tabs.tabs = [tab('t', 'Notes', { kind: 'text-document' })];
    props.tabs.activeId = 't';
    render(<DocumentGroup {...props} />);
    expect(screen.queryByRole('button', { name: /all tabs/ })).toBeNull();
    expect(screen.queryByText('Product discovery')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add tab' })).toBeTruthy();
  });

  it.each([
    [
      'two tabs, one a text document',
      [tab('t', 'Notes', { kind: 'text-document' }), tab('a', 'Overview')],
    ],
    ['one canvas tab', [tab('a', 'Overview')]],
  ])('shows the active tab of a document of %s', (_, tabs) => {
    const props = base();
    props.tabs.tabs = tabs;
    props.tabs.activeId = tabs[0]!.id;
    render(<DocumentGroup {...props} />);
    expect(screen.getByRole('button', { name: /all tabs/ })).toBeTruthy();
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

// A tab’s kind is always findable (docs/specs/007-editor/editor-modes.md 'A tab’s kind is always findable').
describe('DocumentGroup: the tab’s kind', () => {
  const board = (p: Props) => {
    p.tabs.tabs = [
      tab('a', 'Overview'),
      tab('b', 'Bug Reports', { kind: 'board', opensIn: 'plan' }),
    ];
  };
  const hover = (el: Element) => {
    fireEvent.pointerEnter(el, { pointerType: 'mouse' });
    fireEvent.pointerMove(el, { pointerType: 'mouse' });
  };

  it('names the kind on the active tab’s rename glyph, in its hover card and to a screen reader', () => {
    renderGroup(board);
    const rename = screen.getByRole('button', { name: 'Rename Board tab' });
    hover(rename);
    expect(screen.getByRole('tooltip').textContent).toBe('Board tabClick to rename it.');
  });

  it('names a general tab with the mode its glyph shows', () => {
    renderGroup((p) => {
      p.tabs.tabs = [tab('b', 'Sketches', { opensIn: 'draw' })];
    });
    expect(screen.getByRole('button', { name: 'Rename Diagram tab' })).toBeTruthy();
    hover(screen.getByRole('button', { name: 'Rename Diagram tab' }));
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Diagram tab, in Sketch modeClick to rename it.',
    );
  });

  it('names the kind on a read-only glyph too, for a Participant or a Viewer', () => {
    renderGroup((p) => {
      board(p);
      p.tabs.readOnly = true;
    });
    const segment = document.querySelector<HTMLElement>("[data-tour-id='active-tab']")!;
    expect(within(segment).getByRole('img', { name: 'Board tab' })).toBeTruthy();
  });

  it('describes each tab list row by its kind, keeping the row named by the tab', () => {
    renderGroup(board);
    fireEvent.click(screen.getByRole('button', { name: 'Bug Reports, all tabs (2)' }));
    const list = screen.getByRole('dialog', { name: 'Tabs' });
    const row = within(list).getByRole('button', { name: 'Bug Reports' });
    expect(row.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(row.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Board tab',
    );
    const overview = within(list).getByRole('button', { name: 'Overview' });
    expect(document.getElementById(overview.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Diagram tab, in Structured mode',
    );
  });

  it('heads the tab menu with the tab’s kind', () => {
    renderGroup(board);
    fireEvent.click(screen.getByRole('button', { name: 'Tab menu' }));
    expect(screen.getByText('Board tab', { selector: '[data-tab-menu-kind] *' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
  });
});
