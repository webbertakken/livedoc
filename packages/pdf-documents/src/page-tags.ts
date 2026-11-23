// A page's tags (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): the file's structure tree as
// it reaches one page, and its reading for assistive technology. The tags name marked content by id; the text is the
// page's own, joined as Copy joins it, so the tree and the selection never disagree. Pure: text and numbers only.
import { PageText } from './page-text';
import { TextRange, type TextSpan } from './text-range';

/** An element of the file's structure tree: its standard type (the file's role map followed) and its kids. */
export type TagElement = {
  readonly type: string;
  /** Alternative text, or empty. */
  readonly alt: string;
  /** Replacement text (`ActualText`), read in place of the content, or empty. */
  readonly actual: string;
  /** The element's own language, or empty. */
  readonly lang: string;
  readonly kids: readonly TagKid[];
};

/** A kid of an element: an element, or the id of marked content on the page. */
export type TagKid = TagElement | number;

export type PageTags = {
  /** The page's top elements, in the tree's order; none where the tree does not reach the page. */
  readonly elements: readonly TagElement[];
  /** Whether the tree was too deep or too large to read whole (`PDF_TREE_MAX_DEPTH`, `PDF_TREE_MAX_NODES_A_PAGE`). */
  readonly cut: boolean;
};

/** An element as read: its kids are elements and text. */
export type TagNode = {
  readonly type: string;
  readonly alt: string;
  readonly lang: string;
  readonly kids: readonly (TagNode | string)[];
};

/** Why a page reads from geometry rather than its tags. */
export type TagsUnused = 'absent' | 'partial' | 'cut';

export type TagReading =
  | { readonly source: 'tags'; readonly nodes: readonly TagNode[]; readonly count: number }
  | { readonly source: 'geometry'; readonly why: TagsUnused };

const drawn = (page: PageText, at: number): boolean => {
  const box = PageText.boxAt(page, at)!;
  return box.right > box.left || box.top > box.bottom;
};

// Each marked content's runs of the text: the reader's own characters inside a run join it; anything drawn ends it.
function runsOf(page: PageText, marked: Int32Array): Map<number, TextSpan[]> {
  const runs = new Map<number, [number, number][]>();
  let open: { id: number; run: [number, number] } | null = null;
  for (let at = 0; at < marked.length; at += 1) {
    const id = marked[at]!;
    if (id >= 0 && open?.id === id) open.run[1] = at + 1;
    else if (id >= 0) {
      open = { id, run: [at, at + 1] };
      runs.set(id, [...(runs.get(id) ?? []), open.run]);
    } else if (drawn(page, at)) open = null;
  }
  return runs;
}

function reached(elements: readonly TagElement[], into = new Set<number>()): Set<number> {
  for (const element of elements) {
    for (const kid of element.kids) {
      if (typeof kid === 'number') into.add(kid);
      else reached([kid], into);
    }
  }
  return into;
}

function covers(page: PageText, marked: Int32Array, ids: Set<number>): boolean {
  for (let at = 0; at < marked.length; at += 1) {
    const id = marked[at]!;
    if (id === PageText.ARTIFACT || (id >= 0 && ids.has(id))) continue;
    if (drawn(page, at)) return false;
  }
  return true;
}

export const PageTags = {
  /** The page read from its tags where they cover it, else why it reads from geometry. */
  read: (tags: PageTags | null, page: PageText | null): TagReading => {
    if (!tags || tags.elements.length === 0 || (page && !page.marked)) {
      return { source: 'geometry', why: 'absent' };
    }
    if (tags.cut) return { source: 'geometry', why: 'cut' };
    const marked = page?.marked ?? new Int32Array(0);
    if (page && !covers(page, marked, reached(tags.elements))) {
      return { source: 'geometry', why: 'partial' };
    }
    const runs = page ? runsOf(page, marked) : new Map<number, TextSpan[]>();
    let count = 0;
    const textOf = (id: number): string => {
      const spans = runs.get(id);
      return spans ? TextRange.copied(page!, spans).replace(/\s+/g, ' ').trim() : '';
    };
    const nodeOf = ({ type, alt, actual, lang, kids }: TagElement): TagNode => {
      count += 1;
      const read: (TagNode | string)[] = [];
      for (const kid of actual ? [actual] : kids) {
        const text = typeof kid === 'number' ? textOf(kid) : typeof kid === 'string' ? kid : '';
        if (typeof kid === 'object') read.push(nodeOf(kid));
        else if (text) {
          count += 1;
          read.push(text);
        }
      }
      return { type, alt, lang, kids: read };
    };
    const nodes = tags.elements.map(nodeOf);
    return { source: 'tags', nodes, count };
  },
} as const;
