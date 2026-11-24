// The document tabs as a list in the outline's order, changed as a tab's menu changes it
// (docs/specs/034-text-documents/links-and-navigation.md "A tab's menu"): a tab's subtabs are the tabs right after
// it that are deeper. Each change gives the new list, or null where it cannot apply (the menu dims it).
import {
  TEXT_DOCUMENT_TAB_DEPTH,
  TEXT_DOCUMENT_TAB_NAME_MAX,
  type DocumentTabDepth,
  type DocumentTabHead,
} from './document-tabs';

/** Where a dragged tab lands against another (links-and-navigation.md "A tab's menu", Dragging). */
export type DocumentTabDropPlace = 'before' | 'after' | 'into';

/** A document tab as the list holds it: its head and its depth. */
export type DocumentTabEntry = DocumentTabHead & { readonly depth: DocumentTabDepth };

type List<T> = readonly T[];

const DEEPEST = TEXT_DOCUMENT_TAB_DEPTH - 1;

const cut = (text: string): string => [...text].slice(0, TEXT_DOCUMENT_TAB_NAME_MAX).join('');

const at = <T extends DocumentTabEntry>(list: List<T>, id: string): number =>
  list.findIndex((t) => t.id === id);

/** The index right after tab `i`'s subtabs. */
const subtreeEnd = <T extends DocumentTabEntry>(list: List<T>, i: number): number => {
  let end = i + 1;
  while (end < list.length && list[end]!.depth > list[i]!.depth) end += 1;
  return end;
};

/** The index of the sibling before tab `i` (same depth, same parent), or -1. */
const previousSibling = <T extends DocumentTabEntry>(list: List<T>, i: number): number => {
  const depth = list[i]!.depth;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (list[j]!.depth < depth) return -1;
    if (list[j]!.depth === depth) return j;
  }
  return -1;
};

const deepened = <T extends DocumentTabEntry>(tabs: List<T>, by: number): T[] =>
  tabs.map((t) => ({ ...t, depth: (t.depth + by) as DocumentTabDepth }));

const placed = <T extends DocumentTabEntry>(list: List<T>, index: number, tab: T): T[] => [
  ...list.slice(0, index),
  tab,
  ...list.slice(index),
];

export const DocumentTabList = {
  subtreeEnd,
  /** A copy's name: Copy of and the name, cut to the most. */
  copyName: (name: string): string => cut(`Copy of ${name}`),
  rename: <T extends DocumentTabEntry>(list: List<T>, id: string, name: string): T[] | null => {
    const i = at(list, id);
    const held = cut(name.trim());
    if (i < 0 || held.length === 0) return null;
    return list.map((t, j) => (j === i ? { ...t, name: held } : t));
  },
  setEmoji: <T extends DocumentTabEntry>(
    list: List<T>,
    id: string,
    emoji: string | undefined,
  ): T[] | null => {
    const i = at(list, id);
    if (i < 0) return null;
    return list.map((t, j) => {
      if (j !== i) return t;
      const { emoji: _, ...rest } = t;
      return (emoji === undefined ? rest : { ...rest, emoji }) as T;
    });
  },
  /** `tab` as the last subtab of `id`, one deeper; null under a tab at the deepest depth. */
  addSubtab: <T extends DocumentTabEntry>(list: List<T>, id: string, tab: T): T[] | null => {
    const i = at(list, id);
    if (i < 0 || list[i]!.depth >= DEEPEST) return null;
    return placed(list, subtreeEnd(list, i), {
      ...tab,
      depth: (list[i]!.depth + 1) as DocumentTabDepth,
    });
  },
  /** `tab` right after `id`'s subtabs, at `id`'s depth. */
  insertAfter: <T extends DocumentTabEntry>(list: List<T>, id: string, tab: T): T[] | null => {
    const i = at(list, id);
    if (i < 0) return null;
    return placed(list, subtreeEnd(list, i), { ...tab, depth: list[i]!.depth });
  },
  moveUp: <T extends DocumentTabEntry>(list: List<T>, id: string): T[] | null => {
    const i = at(list, id);
    const before = i < 0 ? -1 : previousSibling(list, i);
    if (before < 0) return null;
    const end = subtreeEnd(list, i);
    return [
      ...list.slice(0, before),
      ...list.slice(i, end),
      ...list.slice(before, i),
      ...list.slice(end),
    ];
  },
  moveDown: <T extends DocumentTabEntry>(list: List<T>, id: string): T[] | null => {
    const i = at(list, id);
    if (i < 0) return null;
    const end = subtreeEnd(list, i);
    if (end >= list.length || list[end]!.depth !== list[i]!.depth) return null;
    return DocumentTabList.moveUp(list, list[end]!.id);
  },
  /** One deeper with its subtabs, under the sibling before it; null without one, or past the deepest depth. */
  indent: <T extends DocumentTabEntry>(list: List<T>, id: string): T[] | null => {
    const i = at(list, id);
    if (i < 0 || previousSibling(list, i) < 0) return null;
    const end = subtreeEnd(list, i);
    const subtree = list.slice(i, end);
    if (subtree.some((t) => t.depth + 1 > DEEPEST)) return null;
    return [...list.slice(0, i), ...deepened(subtree, 1), ...list.slice(end)];
  },
  /** One shallower with its subtabs, staying where it is; null at the top level. */
  outdent: <T extends DocumentTabEntry>(list: List<T>, id: string): T[] | null => {
    const i = at(list, id);
    if (i < 0 || list[i]!.depth === 0) return null;
    const end = subtreeEnd(list, i);
    return [...list.slice(0, i), ...deepened(list.slice(i, end), -1), ...list.slice(end)];
  },
  /** Without `id` and its subtabs, and the ids gone; null when they are every tab. */
  remove: <T extends DocumentTabEntry>(
    list: List<T>,
    id: string,
  ): { list: T[]; removed: string[] } | null => {
    const i = at(list, id);
    if (i < 0) return null;
    const end = subtreeEnd(list, i);
    if (end - i === list.length) return null;
    return {
      list: [...list.slice(0, i), ...list.slice(end)],
      removed: list.slice(i, end).map((t) => t.id),
    };
  },
  /**
   * `id` with its subtabs dropped against `target`: before takes its place and depth, after goes right after its
   * subtabs at its depth, into makes it the first subtab; null into its own subtabs or past the deepest depth.
   */
  drop: <T extends DocumentTabEntry>(
    list: List<T>,
    id: string,
    target: string,
    place: DocumentTabDropPlace,
  ): T[] | null => {
    const i = at(list, id);
    if (i < 0 || at(list, target) < 0) return null;
    const end = subtreeEnd(list, i);
    const subtree = list.slice(i, end);
    if (subtree.some((t) => t.id === target)) return null;
    const rest = [...list.slice(0, i), ...list.slice(end)];
    const j = at(rest, target);
    const depth = rest[j]!.depth + (place === 'into' ? 1 : 0);
    const by = depth - list[i]!.depth;
    if (subtree.some((t) => t.depth + by > DEEPEST)) return null;
    const index = place === 'before' ? j : place === 'into' ? j + 1 : subtreeEnd(rest, j);
    return [...rest.slice(0, index), ...deepened(subtree, by), ...rest.slice(index)];
  },
  /** Whether two lists hold the same tabs in the same order at the same depths. */
  same: (a: List<DocumentTabEntry>, b: List<DocumentTabEntry>): boolean =>
    a.length === b.length && a.every((t, k) => t.id === b[k]!.id && t.depth === b[k]!.depth),
} as const;
