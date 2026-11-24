// Document tabs in the editor (docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline"):
// the tab a link names (`?doctab=<id>`), the next and previous tab, a new tab's name, the ceiling on adding, and the list
// as anyone changes it.
import type * as Y from 'yjs';
import {
  DocumentTabs,
  liveTabList,
  TABS_MAP,
  TEXT_DOCUMENT_MAX_TABS,
  type DocumentTab,
} from '@livedoc/text-documents';

/** Insert > Tab's item. */
export const TAB_ITEM = 'tab';

/** The address's query parameter naming a document tab; the hash is the editor's, naming the document's tab. */
export const DOCUMENT_TAB_PARAM = 'doctab';

/** The address with its query naming this document tab, the rest of it as it was. */
export function tabAddress(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set(DOCUMENT_TAB_PARAM, id);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The document tab an address's query names, or null. */
export const tabOfSearch = (search: string): string | null =>
  new URLSearchParams(search).get(DOCUMENT_TAB_PARAM);

/** The tab a text document opens on: the one its link names when listed, else the first. */
export function initialTab(list: readonly DocumentTab[], search: string): string {
  const named = tabOfSearch(search);
  return list.find((t) => t.id === named)?.id ?? list[0]?.id ?? DocumentTabs.firstHead().id;
}

/** The tab after (`1`) or before (`-1`) this one in the outline's order; null at either end. */
export function stepTab(list: readonly DocumentTab[], id: string, step: 1 | -1): string | null {
  const at = list.findIndex((t) => t.id === id);
  if (at < 0) return null;
  return list[at + step]?.id ?? null;
}

/** A new tab's name: Tab N, one more than the tabs there are. */
export const newTabName = (list: readonly DocumentTab[]): string =>
  DocumentTabs.defaultName(list.length + 1);

/** Whether another tab may be added: fewer than the most a text document holds. */
export const canAddTab = (list: readonly DocumentTab[]): boolean =>
  list.length < TEXT_DOCUMENT_MAX_TABS;

/** The live state's document tabs, read again whenever anyone changes them. */
export type TextDocumentTabsStore = {
  readonly doc: Y.Doc;
  readonly read: () => readonly DocumentTab[];
  readonly subscribe: (listener: () => void) => () => void;
};

/** The document tabs of a bound state, as a store the outline and the tab actions read. */
export function textDocumentTabsStore(doc: Y.Doc): TextDocumentTabsStore {
  const map = doc.getMap<unknown>(TABS_MAP);
  let list: readonly DocumentTab[] = liveTabList(doc);
  const listeners = new Set<() => void>();
  const changed = () => {
    list = liveTabList(doc);
    for (const listener of listeners) listener();
  };
  return {
    doc,
    read: () => list,
    subscribe: (listener) => {
      if (listeners.size === 0) map.observe(changed);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) map.unobserve(changed);
      };
    },
  };
}
