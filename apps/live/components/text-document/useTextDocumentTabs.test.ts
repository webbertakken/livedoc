// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline" (The current tab, Adding, Moving
// between tabs, Who may), "Telemetry": the list follows the live state; showing a tab rebinds the editor and names it
// in the address while there are several; + and Insert > Tab add one at the end, named Tab N, and show it, for an
// Editor only, dimmed past the most; Ctrl+Shift+Page Down / Up step through them; both counted.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEXT_DOCUMENT_MAX_TABS, TextDocumentState, addLiveTab } from '@livedoc/text-documents';
import { textDocumentTabsStore, TAB_ITEM } from '@/lib/text-document/text-document-tabs';

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
    expect(track).toHaveBeenCalledWith('Tab', 'Added', 'TextDocumentTab');
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
});
