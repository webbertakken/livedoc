// @vitest-environment jsdom

// Where the tab menu's Delete goes (docs/specs/006-document/document-structure.md "Deleting a tab", "The last tab"):
// a tab among several to the tab delete, a document's last tab to the document delete, and only for a session that
// may delete the document (the owner or a joined team member; never an Editor's share link, never a workbench).

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import type { TabsChromeProps } from './tabs-chrome';
import { LAST_TAB_BLOCKED_REASON, LAST_TAB_CONFIRM } from '@/lib/tab-deletion';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTabsChrome } = await import('./tabs-chrome');

const box = {
  id: 'e',
  type: 'shape',
  shape: 'rect',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
} as unknown as Element;
const tab = (id: string, over: Partial<Tab> = {}): Tab => ({ id, name: id, elements: [], ...over });

function chromeProps(over: Partial<TabsChromeProps> = {}): TabsChromeProps {
  return {
    tabs: [tab('a'), tab('b')],
    activeId: 'a',
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
    ...over,
  };
}

function menuFor(props: TabsChromeProps, tabId: string, close = vi.fn()) {
  const { result } = renderHook(() => useTabsChrome(props));
  const target = props.tabs.find((t) => t.id === tabId)!;
  return result.current.tabMenuProps(target, close);
}

beforeEach(() => track.mockClear());

describe('the tab menu Delete, among several tabs', () => {
  it('deletes the tab, never the document', () => {
    const props = chromeProps();
    const close = vi.fn();
    const menu = menuFor(props, 'a', close);
    expect(menu.deletion).toEqual({ kind: 'tab' });
    menu.onDelete();
    expect(props.onDelete).toHaveBeenCalledWith('a');
    expect(props.onDeleteDocument).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

describe('the tab menu Delete, on the last tab', () => {
  it('deletes the document when the session may, counting it as a last-tab delete', () => {
    const props = chromeProps({ tabs: [tab('a')] });
    const close = vi.fn();
    const menu = menuFor(props, 'a', close);
    expect(menu.deletion).toEqual({ kind: 'document' });
    menu.onDelete();
    expect(props.onDeleteDocument).toHaveBeenCalledTimes(1);
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('Tab', 'Deleted', 'LastTab');
    expect(close).toHaveBeenCalled();
  });

  it('asks first when the last tab holds content, or has not loaded', () => {
    expect(menuFor(chromeProps({ tabs: [tab('a', { elements: [box] })] }), 'a').deletion).toEqual({
      kind: 'document',
      confirm: LAST_TAB_CONFIRM,
    });
    expect(
      menuFor(chromeProps({ tabs: [tab('a')], isTabLoaded: () => false }), 'a').deletion,
    ).toEqual({
      kind: 'document',
      confirm: LAST_TAB_CONFIRM,
    });
  });

  it('is greyed out, deleting nothing, for a session that may not delete the document', () => {
    const props = chromeProps({ tabs: [tab('a')], canDeleteDocument: false });
    const menu = menuFor(props, 'a');
    expect(menu.deletion).toEqual({ kind: 'blocked', reason: LAST_TAB_BLOCKED_REASON });
    menu.onDelete();
    expect(props.onDeleteDocument).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});

// Every other verb of the tab menu reaches its handler with the tab it was opened on, and closes the menu
// (docs/specs/007-editor/live-app.md "Tab menu").
describe('the tab menu verbs', () => {
  it('routes each verb to its handler with the tab, closing the menu', () => {
    const props = chromeProps({ onCopyTabTo: vi.fn(() => Promise.resolve()) });
    const close = vi.fn();
    const menu = menuFor(props, 'b', close);
    menu.onMoveToFolder('Research');
    expect(props.onMoveTabToFolder).toHaveBeenCalledWith('b', 'Research');
    menu.onRemoveFromFolder();
    expect(props.onRemoveTabFromFolder).toHaveBeenCalledWith('b');
    menu.onRename();
    menu.onDuplicate();
    expect(props.onDuplicate).toHaveBeenCalledWith('b');
    menu.onClearContent();
    expect(props.onClearContent).toHaveBeenCalled();
    menu.onImport();
    expect(props.onImportTab).toHaveBeenCalled();
    menu.onExport();
    expect(props.onExportTab).toHaveBeenCalled();
    menu.onToggleLock();
    expect(props.onToggleLockTab).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(8);
  });

  it('closes once a copy lands, and stays open, logging, when it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const landed = vi.fn();
    menuFor(chromeProps({ onCopyTabTo: vi.fn(() => Promise.resolve()) }), 'a', landed).onCopyTo(
      'd2',
    );
    const failed = vi.fn();
    menuFor(
      chromeProps({ onCopyTabTo: vi.fn(() => Promise.reject(new Error('no'))) }),
      'a',
      failed,
    ).onCopyTo('d2');
    await Promise.resolve();
    await Promise.resolve();
    expect(landed).toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[tab-menu] add to document failed', expect.any(Error));
    warn.mockRestore();
  });
});

describe('the palette Rename Tab nonce', () => {
  it('opens the active tab rename once per bump, never for a session that may not rename', () => {
    const { result, rerender } = renderHook((p: TabsChromeProps) => useTabsChrome(p), {
      initialProps: chromeProps({ renameActiveNonce: 0 }),
    });
    rerender(chromeProps({ renameActiveNonce: 1 }));
    expect(result.current.editingId).toBe('a');
    const locked = renderHook((p: TabsChromeProps) => useTabsChrome(p), {
      initialProps: chromeProps({ readOnly: true, renameActiveNonce: 0 }),
    });
    locked.rerender(chromeProps({ readOnly: true, renameActiveNonce: 1 }));
    expect(locked.result.current.editingId).toBeNull();
  });

  it('greys Clear on a locked tab', () => {
    const props = chromeProps({
      activeTabHasContent: true,
      tabs: [tab('a', { locked: true }), tab('b')],
    });
    expect(menuFor(props, 'a').canClearContent).toBe(false);
    expect(menuFor(props, 'b').canClearContent).toBe(true);
  });
});
