// Document tabs in the editor (docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline",
// "A tab's menu"): the tabs as anyone changes them; showing one (the editor rebound, the address naming it while there
// are several); adding one at the end (+ and Insert > Tab, an Editor's, dimmed past the most); stepping to the next or
// previous one; and each tab's menu: renaming, its emoji, a subtab, a copy, its link, moving it and deleting it.
import { useCallback, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  addLiveTab,
  copyLiveTabBody,
  DocumentTabList,
  DocumentTabs,
  setLiveTabList,
  type DocumentTab,
  type DocumentTabDropPlace,
  type DocumentTabEntry,
} from '@livedoc/text-documents';
import { documentAddress } from '@/lib/text-document/text-document-links';
import {
  tabMenuActions,
  type TabMenuRun,
  type TabMove,
} from '@/lib/text-document/text-document-tab-menu';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  canAddTab,
  newTabName,
  stepTab,
  TAB_ITEM,
  tabAddress,
  tabLink,
  type TextDocumentTabsStore,
} from '@/lib/text-document/text-document-tabs';

const NONE: readonly DocumentTab[] = [];
const subscribeNone = () => () => {};
const readNone = () => NONE;

export type TextDocumentTabs = {
  readonly list: readonly DocumentTab[];
  readonly shown: string | null;
  readonly canAdd: boolean;
  /** Whether this session may change the tabs (an Editor's). */
  readonly canEditTabs: boolean;
  show: (id: string) => void;
  add: () => void;
  /** Shows the next (`1`) or previous (`-1`) tab; false at either end. */
  step: (direction: 1 | -1) => boolean;
  readonly actions: OfficeActions;
  /** The tab's menu: each item that applies to it (A tab's menu). */
  menuActions: (id: string) => OfficeActions;
  /** The tab whose name is being edited in place. */
  readonly renaming: string | null;
  /** The name typed, or null to keep the old one (Escape). */
  finishRename: (id: string, name: string | null) => void;
  /** A dialog the menu asked for: choosing a tab's emoji, or deleting it. */
  readonly asking: TabAsking | null;
  pickEmoji: (emoji: string) => void;
  confirmDelete: () => void;
  cancelAsking: () => void;
  /** Whether a drag of `id` may drop there: an Editor's, a change, not refused (A tab's menu, Dragging). */
  canDrop: (id: string, target: string, place: DocumentTabDropPlace) => boolean;
  /** Drops a dragged tab there; false when it may not or nothing changes. */
  drop: (id: string, target: string, place: DocumentTabDropPlace) => boolean;
  /** What was last said aloud (Link copied). */
  readonly said: string;
};

export type TabAsking = { readonly kind: 'emoji' | 'delete'; readonly id: string };

// What a menu change is counted as, and logged as.
const CHANGES: Record<TabMove | 'renamed' | 'emoji' | 'dragged', string> = {
  moveUp: 'moved up',
  moveDown: 'moved down',
  indent: 'indented',
  outdent: 'outdented',
  renamed: 'renamed',
  emoji: 'emoji',
  dragged: 'dragged',
};

export function useTextDocumentTabs({
  store,
  shown,
  showTab,
  canEdit,
  normalStyle,
  documentId,
}: {
  store: TextDocumentTabsStore | null;
  // The text document's id, for a tab's link.
  documentId: string;
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
  // The tabs as the list changes see them: heads and depths.
  const entries: readonly DocumentTabEntry[] = list;
  const canAdd = canEdit && store !== null && canAddTab(list);

  const show = useCallback(
    (id: string, several = list.length > 1) => {
      if (id === shown) return;
      if (!store?.read().some((t) => t.id === id)) return;
      showTab.current(id);
      if (several)
        window.history.replaceState(window.history.state, '', tabAddress(window.location.href, id));
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
    track('Element', 'Added', 'TextDocumentTab');
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

  const [renaming, setRenaming] = useState<string | null>(null);
  const [asking, setAsking] = useState<TabAsking | null>(null);
  const [said, setSaid] = useState('');

  // One write of the whole list, an Editor's only, counted and logged; false when it cannot apply.
  const write = useCallback(
    (next: readonly DocumentTabEntry[] | null, change: string): boolean => {
      if (!store || !canEdit || !next) return false;
      setLiveTabList(store.doc, next);
      track('Element', 'Changed', 'TextDocumentTab');
      debugLog(`[text-document] tab ${change}`, { count: next.length });
      return true;
    },
    [canEdit, store],
  );

  const finishRename = useCallback(
    (id: string, name: string | null) => {
      setRenaming(null);
      const was = list.find((t) => t.id === id)?.name;
      if (name === null || name.trim() === was) return;
      write(DocumentTabList.rename(entries, id, name), CHANGES.renamed);
    },
    [entries, list, write],
  );

  // A new tab's head and its one empty paragraph, put in the list where `place` says, then shown.
  const addPlaced = useCallback(
    (place: (head: DocumentTabEntry) => DocumentTabEntry[] | null, change: string) => {
      if (!store || !canAdd) return;
      const id = DocumentTabs.newId();
      const next = place({ id, name: newTabName(list), depth: 0 });
      if (!next) return;
      store.doc.transact(() => {
        addLiveTab(store.doc, { id, name: newTabName(list), style: normalStyle() });
        setLiveTabList(store.doc, next);
      });
      track('Element', 'Added', 'TextDocumentTab');
      debugLog(`[text-document] tab ${change}`, { tab: id, count: next.length });
      show(id, true);
    },
    [canAdd, list, normalStyle, show, store],
  );

  const run = useMemo<TabMenuRun>(
    () => ({
      rename: (id) => setRenaming(id),
      chooseEmoji: (id) => setAsking({ kind: 'emoji', id }),
      removeEmoji: (id) => write(DocumentTabList.setEmoji(entries, id, undefined), CHANGES.emoji),
      addSubtab: (id) =>
        addPlaced((head) => DocumentTabList.addSubtab(entries, id, head), 'subtab added'),
      duplicate: (id) => {
        const source = list.find((t) => t.id === id);
        if (!store || !canAdd || !source) return;
        const copy = DocumentTabs.newId();
        const next = DocumentTabList.insertAfter(entries, id, {
          id: copy,
          name: DocumentTabList.copyName(source.name),
          ...(source.emoji === undefined ? {} : { emoji: source.emoji }),
          depth: source.depth,
        });
        if (!next) return;
        store.doc.transact(() => {
          copyLiveTabBody(store.doc, id, copy);
          setLiveTabList(store.doc, next);
        });
        track('Element', 'Duplicated', 'TextDocumentTab');
        debugLog('[text-document] tab duplicated', { tab: copy, from: id });
        show(copy, true);
      },
      copyLink: (id) => {
        const link = tabLink(documentAddress(documentId, window.location.origin), id);
        navigator.clipboard?.writeText(link).then(
          () => {
            setSaid('Link copied');
            track('UI', 'Used', 'TextDocumentTabLinkCopied');
          },
          (error: unknown) => debugLog('[text-document] tab link copy failed', String(error)),
        );
      },
      move: (id, move) => write(DocumentTabList[move](entries, id), CHANGES[move]),
      askDelete: (id) => setAsking({ kind: 'delete', id }),
    }),
    [addPlaced, canAdd, documentId, entries, list, show, store, write],
  );

  const menuActions = useCallback(
    (id: string) => tabMenuActions(list, id, canEdit, run),
    [canEdit, list, run],
  );

  const pickEmoji = useCallback(
    (emoji: string) => {
      if (asking?.kind === 'emoji')
        write(DocumentTabList.setEmoji(entries, asking.id, emoji), CHANGES.emoji);
      setAsking(null);
    },
    [asking, entries, write],
  );

  // The tab and its subtabs gone; the shown one among them, the tab before them shown first, else the one after.
  const confirmDelete = useCallback(() => {
    setAsking(null);
    if (asking?.kind !== 'delete' || !store || !canEdit) return;
    const gone = DocumentTabList.remove(entries, asking.id);
    if (!gone) return;
    if (shown !== null && gone.removed.includes(shown)) {
      const at = list.findIndex((t) => t.id === asking.id);
      const next = gone.list[Math.max(0, at - 1)] ?? gone.list[0];
      if (next) show(next.id);
    }
    setLiveTabList(store.doc, gone.list);
    track('Element', 'Removed', 'TextDocumentTab');
    debugLog('[text-document] tab deleted', {
      removed: gone.removed.length,
      count: gone.list.length,
    });
  }, [asking, canEdit, entries, list, show, shown, store]);

  const cancelAsking = useCallback(() => setAsking(null), []);

  // A drop's list, or null where it is refused, changes nothing, or the session may not change the tabs.
  const dropped = useCallback(
    (id: string, target: string, place: DocumentTabDropPlace) => {
      if (!store || !canEdit) return null;
      const next = DocumentTabList.drop(entries, id, target, place);
      return next && !DocumentTabList.same(entries, next) ? next : null;
    },
    [canEdit, entries, store],
  );
  const canDrop = useCallback(
    (id: string, target: string, place: DocumentTabDropPlace) =>
      dropped(id, target, place) !== null,
    [dropped],
  );
  const drop = useCallback(
    (id: string, target: string, place: DocumentTabDropPlace) =>
      write(dropped(id, target, place), CHANGES.dragged),
    [dropped, write],
  );

  return {
    list,
    shown,
    canAdd,
    canEditTabs: canEdit,
    show,
    add,
    step,
    actions,
    menuActions,
    renaming,
    finishRename,
    asking,
    pickEmoji,
    confirmDelete,
    cancelAsking,
    canDrop,
    drop,
    said,
  };
}
