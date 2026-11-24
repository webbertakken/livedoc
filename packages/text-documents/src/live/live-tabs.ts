// Document tabs in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): the root
// map `tabs` holds each tab by id as a whole value, `{ name, emoji, depth, order }`, the outline's order by `order`
// (then id); each tab's body is its own root fragment. A map without entries is one tab, `t.0`, Tab 1.
import * as Y from 'yjs';
import type { Block } from '../model/blocks';
import { DocumentTabs, type DocumentTab, type DocumentTabRead } from '../model/document-tabs';
import type { DocumentTabEntry } from '../model/document-tab-list';
import { FOOTNOTE, PARAGRAPH, TABS_MAP } from './live-names';
import { storyFragment } from './live-stories';
import { tabFragment } from './live-root';
import { FIRST_DOCUMENT_TAB_ID } from '../model/document-tabs';

/** A document tab as the map holds it. */
export type LiveTab = {
  readonly name: string;
  readonly emoji?: string;
  readonly depth: number;
  readonly order: number;
};

const orderOf = (value: unknown): number => {
  const order = (value as { order?: unknown } | undefined)?.order;
  return typeof order === 'number' && Number.isFinite(order) ? order : 0;
};

const byOrder = ([a, x]: [string, unknown], [b, y]: [string, unknown]): number =>
  orderOf(x) - orderOf(y) || (a < b ? -1 : a > b ? 1 : 0);

/** The document tabs' ids in the outline's order: `t.0` alone while the map holds none. */
export function liveTabIds(doc: Y.Doc): string[] {
  const map = doc.getMap<unknown>(TABS_MAP);
  return map.size === 0
    ? [FIRST_DOCUMENT_TAB_ID]
    : [...map.entries()].sort(byOrder).map(([id]) => id);
}

/** Every document tab's body fragment, in the outline's order. */
export const liveTabFragments = (doc: Y.Doc): Y.XmlFragment[] =>
  liveTabIds(doc).map((id) => tabFragment(doc, id));

/** The tabs the map holds, in the outline's order, each with its body read by `blocksOf`; none while it holds none. */
export function readLiveTabs(
  doc: Y.Doc,
  blocksOf: (fragment: Y.XmlFragment) => Block[],
): DocumentTabRead[] {
  const map = doc.getMap<unknown>(TABS_MAP);
  return [...map.entries()].sort(byOrder).map(([id, value]) => {
    const tab = (value ?? {}) as Partial<Record<keyof LiveTab, unknown>>;
    return {
      id,
      name: tab.name,
      emoji: tab.emoji,
      depth: tab.depth,
      body: blocksOf(tabFragment(doc, id)),
    };
  });
}

/**
 * The tabs written in place of the map's: each tab's head by id and its body into its fragment (`nodesOf`); a tab no
 * longer held has its fragment emptied. No tabs (one plain tab) leave the map empty; its body is the caller's to write.
 */
export function writeLiveTabs(
  doc: Y.Doc,
  tabs: readonly DocumentTab[] | undefined,
  nodesOf: (blocks: readonly Block[]) => Y.XmlElement[],
): void {
  const map = doc.getMap<unknown>(TABS_MAP);
  const held = new Set((tabs ?? []).map((t) => t.id));
  for (const id of [...map.keys()])
    if (!held.has(id)) {
      const fragment = tabFragment(doc, id);
      fragment.delete(0, fragment.length);
      map.delete(id);
    }
  (tabs ?? []).forEach((tab, order) => {
    const fragment = tabFragment(doc, tab.id);
    fragment.delete(0, fragment.length);
    fragment.insert(0, nodesOf(tab.body));
    const value: LiveTab = {
      name: tab.name,
      ...(tab.emoji === undefined ? {} : { emoji: tab.emoji }),
      depth: tab.depth,
      order,
    };
    map.set(tab.id, value);
  });
}

/** The document tabs' heads and depths in the outline's order, held to the rules; one, `t.0`, Tab 1, while none. */
export function liveTabList(doc: Y.Doc): DocumentTab[] {
  const read = readLiveTabs(doc, () => []);
  return read.length > 0
    ? DocumentTabs.held(read)
    : [{ ...DocumentTabs.firstHead(), depth: 0, body: [] }];
}

/**
 * A document tab added at the end of the top level, its body one empty paragraph in `style` (links-and-navigation.md
 * "Document tabs in the outline", "Adding"), as one transaction; the first tab joins the map when it held none.
 */
export function addLiveTab(
  doc: Y.Doc,
  { id, name, style }: { id: string; name: string; style: string },
  origin?: unknown,
): void {
  const map = doc.getMap<unknown>(TABS_MAP);
  doc.transact(() => {
    if (map.size === 0) {
      const first: LiveTab = { name: DocumentTabs.defaultName(1), depth: 0, order: 0 };
      map.set(FIRST_DOCUMENT_TAB_ID, first);
    }
    const order = Math.max(...[...map.values()].map(orderOf)) + 1;
    const tab: LiveTab = { name, depth: 0, order };
    const fragment = tabFragment(doc, id);
    fragment.delete(0, fragment.length);
    const paragraph = new Y.XmlElement(PARAGRAPH);
    paragraph.setAttribute('style', style);
    fragment.insert(0, [paragraph]);
    map.set(id, tab);
  }, origin);
}

/**
 * The tab list written as given, in one transaction (links-and-navigation.md "A tab's menu"): each tab's head by id,
 * its order its place; a tab no longer listed taken out, its fragment emptied.
 */
export function setLiveTabList(
  doc: Y.Doc,
  list: readonly DocumentTabEntry[],
  origin?: unknown,
): void {
  const map = doc.getMap<unknown>(TABS_MAP);
  const held = new Set(list.map((t) => t.id));
  doc.transact(() => {
    for (const id of [...map.keys()])
      if (!held.has(id)) {
        const fragment = tabFragment(doc, id);
        fragment.delete(0, fragment.length);
        map.delete(id);
      }
    list.forEach((tab, order) => {
      const value: LiveTab = {
        name: tab.name,
        ...(tab.emoji === undefined ? {} : { emoji: tab.emoji }),
        depth: tab.depth,
        order,
      };
      map.set(tab.id, value);
    });
  }, origin);
}

/**
 * Tab `from`'s writing copied into tab `to`'s fragment, in place of what it held, as one transaction; the copy is its
 * own, its footnotes too: each note's writing copied under a new story id (`newStory`).
 */
export function copyLiveTabBody(
  doc: Y.Doc,
  from: string,
  to: string,
  {
    origin,
    newStory = () => crypto.randomUUID(),
  }: { origin?: unknown; newStory?: () => string } = {},
): void {
  const source = tabFragment(doc, from);
  const target = tabFragment(doc, to);
  doc.transact(() => {
    target.delete(0, target.length);
    target.insert(
      0,
      source
        .toArray()
        .flatMap((node) =>
          node instanceof Y.XmlElement || node instanceof Y.XmlText ? [node.clone()] : [],
        ),
    );
    const marks = [
      ...target.createTreeWalker((n) => n instanceof Y.XmlElement && n.nodeName === FOOTNOTE),
    ];
    for (const mark of marks as Y.XmlElement[]) {
      const story = mark.getAttribute('story');
      if (typeof story !== 'string') continue;
      const copy = newStory();
      storyFragment(doc, copy).insert(
        0,
        storyFragment(doc, story)
          .toArray()
          .flatMap((node) =>
            node instanceof Y.XmlElement || node instanceof Y.XmlText ? [node.clone()] : [],
          ),
      );
      mark.setAttribute('story', copy);
    }
  }, origin);
}
