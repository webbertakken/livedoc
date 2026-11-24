// Document tabs in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): the root
// map `tabs` holds each tab by id as a whole value, `{ name, emoji, depth, order }`, the outline's order by `order`
// (then id); each tab's body is its own root fragment. A map without entries is one tab, `t.0`, Tab 1.
import * as Y from 'yjs';
import type { Block } from '../model/blocks';
import type { DocumentTab, DocumentTabRead } from '../model/document-tabs';
import { TABS_MAP } from './live-names';
import { tabFragment } from './live-root';

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

/** The tabs the map holds, in the outline's order, each with its body read by `blocksOf`; none while it holds none. */
export function readLiveTabs(
  doc: Y.Doc,
  blocksOf: (fragment: Y.XmlFragment) => Block[],
): DocumentTabRead[] {
  const map = doc.getMap<unknown>(TABS_MAP);
  return [...map.entries()]
    .sort(([a, x], [b, y]) => orderOf(x) - orderOf(y) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, value]) => {
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
