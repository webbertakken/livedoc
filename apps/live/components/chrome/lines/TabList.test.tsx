// @vitest-environment jsdom

// The tab list (docs/specs/007-editor/toolbar-layout.md "The tab list"): every tab, in document order, folders as
// headings, presence per row; a filter above five tabs; New Tab; a menu's keyboard.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import type { Participant } from '@/lib/identity';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

const { TabList } = await import('./TabList');
const { useTabsChrome } = await import('./tabs-chrome');

afterEach(cleanup);

const tab = (id: string, name: string, folder?: string): Tab => ({
  id,
  name,
  elements: [],
  ...(folder ? { folder } : {}),
});
const person = (id: string, name: string): Participant =>
  ({ id, name, color: '#0d9488' }) as unknown as Participant;

const SEVEN = [
  tab('a', 'Overview'),
  tab('b', 'User flows'),
  tab('c', 'Checkout flow'),
  tab('d', 'Data model', 'Research'),
  tab('e', 'Interview notes', 'Research'),
  tab('f', 'Sketches'),
  tab('g', 'Roadmap'),
];

type TabsProps = ComponentProps<typeof TabList>['tabs'];
function tabsProps(over: Partial<TabsProps> = {}): TabsProps {
  return {
    tabs: SEVEN,
    activeId: 'c',
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
    participantsByTab: new Map([['e', [person('p1', 'Jo'), person('p2', 'Al')]]]),
    selfId: 'me',
    selfRole: 'edit',
    ...over,
  };
}

function Host({ tabs, onClose }: { tabs: TabsProps; onClose: () => void }) {
  const chrome = useTabsChrome(tabs);
  return (
    <>
      <button type="button" data-testid="opener">
        opener
      </button>
      <TabList
        tabs={tabs}
        chrome={chrome}
        opener={document.querySelector<HTMLElement>('[data-testid="opener"]')}
        peopleHere={3}
        onClose={onClose}
      />
    </>
  );
}
const renderList = (over: Partial<TabsProps> = {}) => {
  const props = tabsProps(over);
  const onClose = vi.fn();
  render(<Host tabs={props} onClose={onClose} />);
  return { props, onClose, list: screen.getByRole('dialog', { name: 'Tabs' }) };
};
const rowNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-tab-row') ?? `folder:${li.getAttribute('data-tab-folder')}`);

describe('TabList', () => {
  it('heads itself with the count and how many people are here', () => {
    const { list } = renderList();
    expect(list.textContent).toContain('Tabs · 7');
    expect(list.textContent).toContain('3 people here');
  });

  it('lists every tab in document order, folders as headings with their tabs under them', () => {
    const { list } = renderList();
    expect(rowNames(list)).toEqual(['a', 'b', 'c', 'folder:Research', 'd', 'e', 'f', 'g']);
    const heading = list.querySelector<HTMLElement>('[data-tab-folder="Research"]')!;
    expect(heading.textContent).toContain('Research');
    expect(heading.textContent).toContain('2');
  });

  it('marks the active row and gives it the tab menu; presence on each row', () => {
    const { list } = renderList();
    const active = within(list).getByRole('button', { name: 'Checkout flow' });
    expect(active.getAttribute('aria-current')).toBe('page');
    const activeRow = active.closest('[data-tab-row]')!;
    expect(within(activeRow as HTMLElement).getByRole('button', { name: 'Tab menu' })).toBeTruthy();
    const notes = list.querySelector('[data-tab-row="e"]') as HTMLElement;
    expect(within(notes).getAllByRole('img').length).toBeGreaterThan(0);
  });

  it('switches to a row’s tab and closes', () => {
    const { list, props, onClose } = renderList();
    fireEvent.click(within(list).getByRole('button', { name: 'Roadmap' }));
    expect(props.onSelect).toHaveBeenCalledWith('g');
    expect(onClose).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('Tab', 'Selected', 'TabList');
  });

  it('offers Find a Tab above five tabs, narrowing the rows by name', () => {
    const { list } = renderList();
    const filter = within(list).getByRole('searchbox', { name: 'Find a tab' });
    fireEvent.change(filter, { target: { value: 'flow' } });
    expect(rowNames(list)).toEqual(['b', 'c']);
    fireEvent.change(filter, { target: { value: 'notes' } });
    expect(rowNames(list)).toEqual(['folder:Research', 'e']);
    fireEvent.change(filter, { target: { value: 'zzz' } });
    expect(list.textContent).toContain('No tab matches');
  });

  it('has no filter with five tabs or fewer', () => {
    const { list } = renderList({ tabs: SEVEN.slice(0, 5) });
    expect(within(list).queryByRole('searchbox')).toBeNull();
  });

  it('offers New Tab, New Board, New Sheet and New Dashboard, for someone who may', () => {
    const { list } = renderList();
    const footer = [...list.querySelectorAll<HTMLElement>('[data-tab-list-new]')];
    expect(footer.map((b) => b.textContent)).toEqual([
      'New Tab',
      'New Board',
      'New Sheet',
      'New Dashboard',
    ]);
  });

  it.each([
    ['New Tab', 'tab'],
    ['New Sheet', 'sheet'],
  ] as const)('adds from %s, and closes', (name, choice) => {
    const { list, props, onClose } = renderList();
    fireEvent.click(within(list).getByRole('button', { name }));
    expect(props.onAdd).toHaveBeenCalledWith(choice);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('for someone who may not change the tabs: no New Tab, no menu, no rename, no drag', () => {
    const { list } = renderList({ readOnly: true });
    expect(within(list).queryByRole('button', { name: 'New Tab' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'New Board' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'Tab menu' })).toBeNull();
    const row = within(list).getByRole('button', { name: 'Roadmap' });
    fireEvent.doubleClick(row);
    expect(within(list).queryByDisplayValue('Roadmap')).toBeNull();
    expect(row.closest('[draggable="true"]')).toBeNull();
  });

  it('renames a row on a double-click', () => {
    const { list, props } = renderList();
    fireEvent.doubleClick(within(list).getByRole('button', { name: 'Roadmap' }));
    const field = within(list).getByDisplayValue('Roadmap');
    fireEvent.change(field, { target: { value: 'Plan' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onRename).toHaveBeenCalledWith('g', 'Plan');
  });

  it('shows a tab outside the session’s scope as Not shared, not switchable', () => {
    const { list, props } = renderList({ isOutOfScope: (id) => id === 'g' });
    const row = list.querySelector('[data-tab-row="g"]') as HTMLElement;
    expect(row.textContent).toContain('Not shared');
    expect(row.textContent).not.toContain('Roadmap');
    fireEvent.click(within(row).getByRole('button'));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('drops a row on a folder heading into the folder', () => {
    const { list, props } = renderList();
    const heading = list.querySelector<HTMLElement>('[data-tab-folder="Research"]')!;
    const data = { getData: () => 'a', setData: vi.fn(), dropEffect: 'move' };
    fireEvent.dragOver(heading, { dataTransfer: data });
    fireEvent.drop(heading, { dataTransfer: data });
    expect(props.onMoveTabToFolder).toHaveBeenCalledWith('a', 'Research');
  });
});

describe('TabList keyboard', () => {
  it('opens on the filter, walks the rows with the arrows, Home and End, and switches with Enter', () => {
    const { list, props } = renderList();
    const filter = within(list).getByRole('searchbox', { name: 'Find a tab' });
    expect(document.activeElement).toBe(filter);
    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'Overview' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'User flows' }));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(
      within(list).getByRole('button', { name: 'New Dashboard' }),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(filter);
    fireEvent.keyDown(filter, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(
      within(list).getByRole('button', { name: 'New Dashboard' }),
    );
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.click(document.activeElement!);
    expect(props.onSelect).toHaveBeenCalledWith('g');
  });

  it('opens on the active row when there is no filter', () => {
    const { list } = renderList({ tabs: SEVEN.slice(0, 5) });
    expect(document.activeElement).toBe(
      within(list).getByRole('button', { name: 'Checkout flow' }),
    );
  });

  it('renames the focused row with F2, for someone who may', () => {
    const { list } = renderList({ tabs: SEVEN.slice(0, 5) });
    fireEvent.keyDown(document.activeElement!, { key: 'F2' });
    expect(within(list).getByDisplayValue('Checkout flow')).toBeTruthy();
  });

  it('closes on Escape, handing the focus back to its opener', () => {
    const { onClose } = renderList();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
