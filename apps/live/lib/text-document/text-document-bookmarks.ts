// Bookmarks in the editor (docs/specs/034-text-documents/links-and-navigation.md "Bookmarks"): the node, an atom of
// no width whose ribbon is drawn in the left margin beside its line; Insert > Bookmark at the caret, in the body; the
// bookmark beside a caret; where one is; the bookmarks the link editor offers; and a bookmark pasted where its name is
// already taken left out, so a name stays one place. A hidden bookmark (a heading's id) is drawn as nothing, has no
// card and is offered with the headings, never the bookmarks.
import type { NodeSpec, Node as PmNode } from 'prosemirror-model';
import { Fragment, Slice } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { BOOKMARK, BOOKMARK_ATTRIBUTES, Bookmarks } from '@livedoc/text-documents';
import { nullAttributes } from './text-document-attributes';

/** Insert > Bookmark. */
export const BOOKMARK_ITEM = 'bookmark';
/** The node's class, and its ribbon's, drawn out of the paragraph's lines. */
export const BOOKMARK_CLASS = 'text-document-bookmark';
export const BOOKMARK_GLYPH_CLASS = 'text-document-bookmark-glyph';
/** How much of the text after a bookmark names it in the link editor's list (default). */
export const BOOKMARK_LABEL_LENGTH = 40;
/** The most bookmarks the link editor offers (default). */
export const BOOKMARK_TARGETS_MAX = 8;

const SVG_NS = 'http://www.w3.org/2000/svg';

export const bookmarkNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  // The caret steps past it as past nothing; Backspace beside it takes it with the character.
  selectable: false,
  attrs: nullAttributes(BOOKMARK_ATTRIBUTES),
  leafText: () => '',
  toDOM: (node) => {
    const name = (node.attrs as { name: unknown }).name;
    if (typeof name === 'string' && Bookmarks.hidden(name))
      return [
        'span',
        {
          class: BOOKMARK_CLASS,
          contenteditable: 'false',
          'data-bookmark': name,
          'data-hidden': 'true',
        },
      ];
    return [
      'span',
      {
        class: BOOKMARK_CLASS,
        contenteditable: 'false',
        'data-bookmark': typeof name === 'string' ? name : '',
      },
      [
        'span',
        { class: BOOKMARK_GLYPH_CLASS, role: 'img', 'aria-label': 'Bookmark' },
        [
          `${SVG_NS} svg`,
          { viewBox: '0 0 24 24', width: '14', height: '14', 'aria-hidden': 'true' },
          [`${SVG_NS} path`, { d: 'M6 3h12v18l-6-4-6 4z', fill: 'currentColor' }],
        ],
      ],
    ];
  },
};

const nameOf = (node: PmNode): string => {
  const name = (node.attrs as { name: unknown }).name;
  return typeof name === 'string' ? name : '';
};

/** Every bookmark's name in the writing. */
export function bookmarkNames(doc: PmNode): Set<string> {
  const names = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === BOOKMARK && nameOf(node)) names.add(nameOf(node));
  });
  return names;
}

const shown = (node: PmNode) =>
  node.type.name === BOOKMARK && !!nameOf(node) && !Bookmarks.hidden(nameOf(node));

// Google's ODF links to a heading as `#heading=h.<id>`, its bookmark named `_heading=h.<id>` (default).
const GOOGLE_ODF_HEADING = /^heading=h\./;

/** Where the bookmark of a name is (Google's ODF heading link read as its hidden name); none when it is gone. */
export function bookmarkPosition(doc: PmNode, name: string): number | null {
  const find = (wanted: string) => {
    let found: number | null = null;
    doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name === BOOKMARK && nameOf(node) === wanted) found = pos;
      return true;
    });
    return found;
  };
  const found = find(name);
  return found === null && GOOGLE_ODF_HEADING.test(name) ? find(`_${name}`) : found;
}

/** The bookmark beside a caret (nothing selected), just before or after it. */
export function bookmarkAt(state: EditorState): { pos: number; name: string } | null {
  const { empty, $from } = state.selection;
  if (!empty) return null;
  for (const [node, pos] of [
    [$from.nodeAfter, $from.pos],
    [$from.nodeBefore, $from.pos - ($from.nodeBefore?.nodeSize ?? 0)],
  ] as const)
    if (node && shown(node)) return { pos, name: nameOf(node) };
  return null;
}

/** Insert > Bookmark: a new one at the caret, at a selection's start; the caret after it. */
export function insertBookmark(name: string): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes[BOOKMARK];
    const at = state.selection.from;
    if (!type || !state.selection.$from.parent.inlineContent) return false;
    if (dispatch) {
      const tr = state.tr.insert(at, type.create({ name }));
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    }
    return true;
  };
}

/** A new bookmark's name, none of the writing's. */
export const newBookmarkName = (doc: PmNode, random?: () => number): string =>
  Bookmarks.newName(bookmarkNames(doc), random);

/** Remove on a bookmark's card. */
export function removeBookmark(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (node?.type.name !== BOOKMARK) return false;
    dispatch?.(state.tr.delete(pos, pos + node.nodeSize));
    return true;
  };
}

/** A bookmark the link editor offers: its name, and the text after it that names it. */
export type BookmarkTarget = { readonly name: string; readonly label: string };

// What names a bookmark: the text after it in its paragraph, or "Bookmark" when none.
function labelAt(doc: PmNode, pos: number, node: PmNode): string {
  const $pos = doc.resolve(pos);
  const after = $pos.parent
    .textBetween($pos.parentOffset + node.nodeSize, $pos.parent.content.size, '', '')
    .trim()
    .slice(0, BOOKMARK_LABEL_LENGTH);
  return after || 'Bookmark';
}

/** What names the bookmark of a name; none when it is gone. */
export function bookmarkLabel(doc: PmNode, name: string): string | null {
  const pos = bookmarkPosition(doc, name);
  const node = pos === null ? null : doc.nodeAt(pos);
  return pos !== null && node ? labelAt(doc, pos, node) : null;
}

/** The bookmarks whose label holds every typed word (all, when nothing is typed), at most BOOKMARK_TARGETS_MAX. */
export function bookmarkTargets(doc: PmNode, typed: string): BookmarkTarget[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const out: BookmarkTarget[] = [];
  doc.descendants((node, pos) => {
    if (out.length >= BOOKMARK_TARGETS_MAX) return false;
    if (!shown(node)) return true;
    const label = labelAt(doc, pos, node);
    if (words.every((w) => label.toLowerCase().includes(w)))
      out.push({ name: nameOf(node), label });
    return false;
  });
  return out;
}

/** A pasted slice without the bookmarks whose names the writing already holds (a copy, never a second place). */
export function withoutTakenBookmarks(slice: Slice, doc: PmNode): Slice {
  const taken = bookmarkNames(doc);
  if (taken.size === 0) return slice;
  const strip = (fragment: Fragment): Fragment => {
    const nodes: PmNode[] = [];
    fragment.forEach((node) => {
      if (node.type.name === BOOKMARK && taken.has(nameOf(node))) return;
      nodes.push(node.isLeaf ? node : node.copy(strip(node.content)));
    });
    return Fragment.fromArray(nodes);
  };
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
}

/** The address part a copied bookmark link carries, and reading it back. */
export const bookmarkHash = (name: string): string => `#bookmark=${encodeURIComponent(name)}`;
export function bookmarkOfHash(hash: string): string | null {
  const match = /^#bookmark=(.+)$/.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}
