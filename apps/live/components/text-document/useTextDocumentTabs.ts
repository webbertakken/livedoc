// Document tabs in the editor (docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline"):
// the tabs as anyone changes them; showing one (the editor rebound, the address naming it while there are several);
// adding one at the end (+ and Insert > Tab, an Editor's, dimmed past the most); stepping to the next or previous one.
import { useCallback, useMemo, useSyncExternalStore, type RefObject } from 'react';
import { addLiveTab, DocumentTabs, type DocumentTab } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  canAddTab,
  newTabName,
  stepTab,
  TAB_ITEM,
  tabHash,
  type TextDocumentTabsStore,
} from '@/lib/text-document/text-document-tabs';

const NONE: readonly DocumentTab[] = [];
const subscribeNone = () => () => {};
const readNone = () => NONE;

export type TextDocumentTabs = {
  readonly list: readonly DocumentTab[];
  readonly shown: string | null;
  readonly canAdd: boolean;
  show: (id: string) => void;
  add: () => void;
  /** Shows the next (`1`) or previous (`-1`) tab; false at either end. */
  step: (direction: 1 | -1) => boolean;
  readonly actions: OfficeActions;
};

export function useTextDocumentTabs({
  store,
  shown,
  showTab,
  canEdit,
  normalStyle,
}: {
  store: TextDocumentTabsStore | null;
  shown: string | null;
  // The surface's way to bind the editor to a tab's body.
  showTab: RefObject<(id: string) => void>;
  canEdit: boolean;
  // The id of Normal text, a new tab's one paragraph's style.
  normalStyle: () => string;
}): TextDocumentTabs {
  const list = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    store?.read ?? readNone,
    readNone,
  );
  const canAdd = canEdit && store !== null && canAddTab(list);

  const show = useCallback(
    (id: string, several = list.length > 1) => {
      if (id === shown) return;
      if (!store?.read().some((t) => t.id === id)) return;
      showTab.current(id);
      if (several) {
        const { pathname, search } = window.location;
        window.history.replaceState(window.history.state, '', `${pathname}${search}${tabHash(id)}`);
      }
      track('UI', 'Used', 'TextDocumentTabShown');
      debugLog('[text-document] tab shown', { tab: id });
    },
    [list.length, shown, store, showTab],
  );

  const add = useCallback(() => {
    if (!store || !canAdd) return;
    const id = DocumentTabs.newId();
    const name = newTabName(list);
    addLiveTab(store.doc, { id, name, style: normalStyle() });
    track('Tab', 'Added', 'TextDocumentTab');
    debugLog('[text-document] tab added', { tab: id, count: list.length + 1 });
    show(id, true);
  }, [canAdd, list, normalStyle, show, store]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = shown === null ? null : stepTab(list, shown, direction);
      if (next === null) return false;
      show(next);
      return true;
    },
    [list, show, shown],
  );

  const actions = useMemo<OfficeActions>(
    () => (canAdd ? { [TAB_ITEM]: { run: add } } : {}),
    [add, canAdd],
  );

  return { list, shown, canAdd, show, add, step, actions };
}
