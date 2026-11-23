// A PDF's outline as the left panel shows it (docs/specs/035-pdf-documents/reading-surface.md "Outline"): the
// engine's bookmarks, a flat list in reading order with each one's depth, made a tree; which bookmarks show for the
// ones unfolded; the one for the page in view; and where each key moves.
import type { OutlineItem, PageName } from '@livedoc/pdf-documents';

export type PdfOutlineNode = {
  readonly item: OutlineItem;
  /** Its parent's index, or null at the top level. */
  readonly parent: number | null;
  /** Its children's indices, in reading order. */
  readonly children: readonly number[];
};

export type PdfOutline = { readonly nodes: readonly PdfOutlineNode[] };

/** What a key does: the bookmark to focus, and a fold to open or close, or every fold to open. */
export type PdfOutlineMove = {
  readonly focus: number;
  readonly open?: number;
  readonly close?: number;
  readonly openAll?: true;
};

export const PdfOutline = {
  /** A bookmark nests under the nearest one before it that is shallower, however deep the file says it is. */
  of: (items: readonly OutlineItem[]): PdfOutline => {
    const parents: (number | null)[] = [];
    const children: number[][] = items.map(() => []);
    const path: number[] = [];
    items.forEach((item, at) => {
      while (path.length > 0 && items[path.at(-1)!]!.depth >= item.depth) path.pop();
      const parent = path.at(-1) ?? null;
      parents.push(parent);
      if (parent !== null) children[parent]!.push(at);
      path.push(at);
    });
    return {
      nodes: items.map((item, at) => ({ item, parent: parents[at]!, children: children[at]! })),
    };
  },

  /** The bookmarks shown, in reading order: the top level, and the children of each unfolded one shown. */
  shown: (outline: PdfOutline, open: ReadonlySet<number>): number[] => {
    const out: number[] = [];
    const walk = (indices: readonly number[]) => {
      for (const at of indices) {
        out.push(at);
        if (open.has(at)) walk(outline.nodes[at]!.children);
      }
    };
    walk(PdfOutline.roots(outline));
    return out;
  },

  roots: (outline: PdfOutline): number[] =>
    outline.nodes.flatMap((node, at) => (node.parent === null ? [at] : [])),

  /** Every bookmark with children, unfolded. */
  allOpen: (outline: PdfOutline): Set<number> =>
    new Set(outline.nodes.flatMap((node, at) => (node.children.length > 0 ? [at] : []))),

  /** The last bookmark, in reading order, whose page is the page in view or the nearest before it; null for none. */
  current: (outline: PdfOutline, pages: readonly PageName[], inView: number): number | null => {
    let best: { at: number; page: number } | null = null;
    for (const [at, { item }] of outline.nodes.entries()) {
      if (item.target?.kind !== 'place') continue;
      const page = pages.indexOf(item.target.page);
      if (page < 0 || page > inView) continue;
      if (!best || page >= best.page) best = { at, page };
    }
    return best?.at ?? null;
  },

  /** The bookmark marked for `current`: itself where shown, else its nearest shown parent. */
  shownOf: (
    outline: PdfOutline,
    open: ReadonlySet<number>,
    current: number | null,
  ): number | null => {
    if (current === null) return null;
    const shown = new Set(PdfOutline.shown(outline, open));
    let at: number | null = current;
    while (at !== null && !shown.has(at)) at = outline.nodes[at]!.parent;
    return at;
  },

  /** Where a key moves from the focused bookmark `at` (a tree's keys); null for a key the tree leaves alone. */
  key: (
    outline: PdfOutline,
    open: ReadonlySet<number>,
    at: number,
    key: string,
  ): PdfOutlineMove | null => {
    const shown = PdfOutline.shown(outline, open);
    const place = shown.indexOf(at);
    const node = outline.nodes[at]!;
    switch (key) {
      case 'ArrowDown':
        return { focus: shown[Math.min(place + 1, shown.length - 1)]! };
      case 'ArrowUp':
        return { focus: shown[Math.max(place - 1, 0)]! };
      case 'Home':
        return { focus: shown[0]! };
      case 'End':
        return { focus: shown.at(-1)! };
      case 'ArrowRight':
        if (node.children.length === 0) return { focus: at };
        return open.has(at) ? { focus: node.children[0]! } : { focus: at, open: at };
      case 'ArrowLeft':
        if (open.has(at)) return { focus: at, close: at };
        return { focus: node.parent ?? at };
      case '*':
        return { focus: at, openAll: true };
      default:
        return null;
    }
  },
} as const;
