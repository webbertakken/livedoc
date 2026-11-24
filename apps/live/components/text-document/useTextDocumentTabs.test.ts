// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline" (The current tab, Adding, Moving
// between tabs, Who may), "Telemetry": the list follows the live state; showing a tab rebinds the editor and names it
// in the address while there are several; + and Insert > Tab add one at the end, named Tab N, and show it, for an
// Editor only, dimmed past the most; Ctrl+Shift+Page Down / Up step through them; both counted.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEXT_DOCUMENT_MAX_TABS, TextDocumentState, addLiveTab } from '@livedoc/text-documents';
import { textDocumentTabsStore, TAB_ITEM } from '@/lib/text-document/text-document-tabs';
import { TAB_MENU_ITEMS } from '@/lib/text-document/text-document-tab-menu';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentTabs } = await import('./useTextDocumentTabs');

afterEach(() => {
  track.mockClear();
  window.history.replaceState(null, '', '/d/doc');
});

function setup({ canEdit = true, shown = 't.0' } = {}) {
  const doc = TextDocumentState.load();
  const store = textDocumentTabsStore(doc);
  const showTab = { current: vi.fn() };
  const hook = renderHook(
    (props: { shown: string }) =>
      useTextDocumentTabs({
        store,
        documentId: 'doc',
        shown: props.shown,
        showTab,
        canEdit,
        normalStyle: () => 'Standard',
      }),
    { initialProps: { shown } },
  );
  return { doc, store, showTab, hook };
}

describe('useTextDocumentTabs', () => {
  it('lists the tabs as anyone changes them', () => {
    const { doc, hook } = setup();
    expect(hook.result.current.list.map((t) => t.name)).toEqual(['Tab 1']);
    act(() => addLiveTab(doc, { id: 't.b', name: 'Tab 2', style: 'Standard' }));
    expect(hook.result.current.list.map((t) => t.name)).toEqual(['Tab 1', 'Tab 2']);
  });

  it('shows a tab: the editor rebound, the address naming it, counted', () => {
    const { doc, hook, showTab } = setup();
    act(() => addLiveTab(doc, { id: 't.b', name: 'Tab 2', style: 'Standard' }));
    act(() => hook.result.current.show('t.b'));
    expect(showTab.current).toHaveBeenCalledWith('t.b');
    expect(window.location.search).toBe('?doctab=t.b');
    expect(window.location.pathname).toBe('/d/doc');
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentTabShown');
  });

  it('shows nothing again for the tab already shown, or one no longer listed', () => {
    const { hook, showTab } = setup();
    act(() => hook.result.current.show('t.0'));
    act(() => hook.result.current.show('t.gone'));
    expect(showTab.current).not.toHaveBeenCalled();
  });

  it('adds a tab at the end named Tab N, one empty paragraph, shows it and counts it', () => {
    const { doc, hook, showTab } = setup();
    act(() => hook.result.current.add());
    const [, added] = hook.result.current.list;
    expect(added?.name).toBe('Tab 2');
    expect(added?.id).toMatch(/^t\.[a-z0-9]{12}$/);
    expect(TextDocumentState.tabBody(doc, added!.id).length).toBe(1);
    expect(showTab.current).toHaveBeenCalledWith(added!.id);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentTab');
  });

  it('binds Insert > Tab for an Editor, dimmed for anyone else and past the most', () => {
    expect(setup().hook.result.current.actions[TAB_ITEM]).toBeDefined();
    const viewer = setup({ canEdit: false });
    expect(viewer.hook.result.current.actions[TAB_ITEM]).toBeUndefined();
    act(() => viewer.hook.result.current.add());
    expect(viewer.hook.result.current.list).toHaveLength(1);
    const full = setup();
    act(() => {
      for (let i = 1; i < TEXT_DOCUMENT_MAX_TABS; i += 1)
        addLiveTab(full.doc, { id: `t.x${i}`, name: `Tab ${i + 1}`, style: 'Standard' });
    });
    expect(full.hook.result.current.actions[TAB_ITEM]).toBeUndefined();
  });

  it('steps to the next and previous tab, nowhere past either end', () => {
    const { doc, hook, showTab } = setup();
    act(() => addLiveTab(doc, { id: 't.b', name: 'Tab 2', style: 'Standard' }));
    expect(hook.result.current.step(1)).toBe(true);
    expect(showTab.current).toHaveBeenLastCalledWith('t.b');
    hook.rerender({ shown: 't.b' });
    expect(hook.result.current.step(1)).toBe(false);
    expect(hook.result.current.step(-1)).toBe(true);
    expect(showTab.current).toHaveBeenLastCalledWith('t.0');
  });

  // links-and-navigation.md "A tab's menu": each item's change is one write of the list, counted.
  describe('a tab’s menu', () => {
    function withTwo() {
      const set = setup();
      act(() => addLiveTab(set.doc, { id: 't.b', name: 'Tab 2', style: 'Standard' }));
      return set;
    }
    const names = (hook: ReturnType<typeof setup>['hook']) =>
      hook.result.current.list.map((t) => `${t.emoji ?? ''}${t.name}:${t.depth}`);
    const press = (hook: ReturnType<typeof setup>['hook'], id: string, item: string) =>
      act(() => hook.result.current.menuActions(id)[item]!.run());

    it('renames in place: the name typed kept, Escape keeping the old one', () => {
      const { hook } = withTwo();
      press(hook, 't.b', TAB_MENU_ITEMS.rename);
      expect(hook.result.current.renaming).toBe('t.b');
      act(() => hook.result.current.finishRename('t.b', null));
      expect(hook.result.current.renaming).toBeNull();
      expect(names(hook)).toEqual(['Tab 1:0', 'Tab 2:0']);
      act(() => hook.result.current.finishRename('t.b', 'Notes'));
      expect(names(hook)).toEqual(['Tab 1:0', 'Notes:0']);
      expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTab');
    });

    it('gives an emoji from the dialog and takes it away', () => {
      const { hook } = withTwo();
      press(hook, 't.b', TAB_MENU_ITEMS.chooseEmoji);
      expect(hook.result.current.asking).toEqual({ kind: 'emoji', id: 't.b' });
      act(() => hook.result.current.pickEmoji('📌'));
      expect(names(hook)).toEqual(['Tab 1:0', '📌Tab 2:0']);
      press(hook, 't.b', TAB_MENU_ITEMS.removeEmoji);
      expect(names(hook)).toEqual(['Tab 1:0', 'Tab 2:0']);
    });

    it('adds a subtab one deeper and shows it', () => {
      const { hook, showTab } = withTwo();
      press(hook, 't.0', TAB_MENU_ITEMS.addSubtab);
      expect(names(hook)).toEqual(['Tab 1:0', 'Tab 3:1', 'Tab 2:0']);
      expect(showTab.current).toHaveBeenLastCalledWith(hook.result.current.list[1]!.id);
    });

    it('duplicates a tab with its writing after it, named Copy of, and shows it', () => {
      const { doc, hook, showTab } = withTwo();
      press(hook, 't.0', TAB_MENU_ITEMS.duplicate);
      expect(names(hook)).toEqual(['Tab 1:0', 'Copy of Tab 1:0', 'Tab 2:0']);
      const copy = hook.result.current.list[1]!.id;
      expect(TextDocumentState.tabBody(doc, copy).length).toBe(
        TextDocumentState.tabBody(doc, 't.0').length,
      );
      expect(showTab.current).toHaveBeenLastCalledWith(copy);
      expect(track).toHaveBeenCalledWith('Element', 'Duplicated', 'TextDocumentTab');
    });

    it('moves and nests a tab', () => {
      const { hook } = withTwo();
      press(hook, 't.b', TAB_MENU_ITEMS.indent);
      expect(names(hook)).toEqual(['Tab 1:0', 'Tab 2:1']);
      press(hook, 't.b', TAB_MENU_ITEMS.outdent);
      press(hook, 't.b', TAB_MENU_ITEMS.moveUp);
      expect(names(hook)).toEqual(['Tab 2:0', 'Tab 1:0']);
    });

    // links-and-navigation.md "A tab's menu" (Dragging): one write, counted; refused or unchanged, nothing written.
    it('drops a dragged tab into another, refusing its own subtabs', () => {
      const { hook } = withTwo();
      expect(hook.result.current.canDrop('t.b', 't.0', 'into')).toBe(true);
      expect(hook.result.current.canDrop('t.b', 't.b', 'into')).toBe(false);
      let dropped = false;
      act(() => {
        dropped = hook.result.current.drop('t.b', 't.0', 'into');
      });
      expect(dropped).toBe(true);
      expect(names(hook)).toEqual(['Tab 1:0', 'Tab 2:1']);
      expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTab');
      expect(hook.result.current.canDrop('t.0', 't.b', 'before')).toBe(false);
    });

    it('writes nothing for a drop where the tab already is', () => {
      const { hook } = withTwo();
      track.mockClear();
      expect(hook.result.current.canDrop('t.b', 't.0', 'after')).toBe(false);
      act(() => {
        expect(hook.result.current.drop('t.b', 't.0', 'after')).toBe(false);
      });
      expect(track).not.toHaveBeenCalled();
    });

    it('deletes after asking, showing the tab before the one shown', () => {
      const { doc, hook, showTab } = withTwo();
      hook.rerender({ shown: 't.b' });
      press(hook, 't.b', TAB_MENU_ITEMS.delete);
      expect(hook.result.current.asking).toEqual({ kind: 'delete', id: 't.b' });
      act(() => hook.result.current.confirmDelete());
      expect(names(hook)).toEqual(['Tab 1:0']);
      expect(showTab.current).toHaveBeenLastCalledWith('t.0');
      expect(TextDocumentState.tabBody(doc, 't.b').length).toBe(0);
      expect(track).toHaveBeenCalledWith('Element', 'Removed', 'TextDocumentTab');
    });

    it('keeps the tabs when a delete is cancelled', () => {
      const { hook } = withTwo();
      press(hook, 't.b', TAB_MENU_ITEMS.delete);
      act(() => hook.result.current.cancelAsking());
      expect(hook.result.current.asking).toBeNull();
      expect(names(hook)).toHaveLength(2);
    });

    it('copies a tab’s link naming it, and says so', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.assign(navigator, { clipboard: { writeText } });
      const { hook } = withTwo();
      press(hook, 't.b', TAB_MENU_ITEMS.copyLink);
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/document/doc?doctab=t.b`);
      await waitFor(() => expect(hook.result.current.said).toBe('Link copied'));
      expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentTabLinkCopied');
    });

    it('offers only Copy link to a session that may not edit', () => {
      const { hook } = setup({ canEdit: false });
      expect(Object.keys(hook.result.current.menuActions('t.0'))).toEqual([
        TAB_MENU_ITEMS.copyLink,
      ]);
      expect(hook.result.current.canDrop('t.0', 't.0', 'before')).toBe(false);
    });
  });
});
