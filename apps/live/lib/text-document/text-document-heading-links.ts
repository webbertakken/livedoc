// Heading links (docs/specs/034-text-documents/links-and-navigation.md "Heading links"): a heading's id is the first
// hidden bookmark at its start, before its text, as Google writes one per heading; a heading gains one when a link
// first needs it; the heading at the caret; the headings the link editor offers; a heading's address and title.
import type { Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { BOOKMARK, Bookmarks, type Style } from '@livedoc/text-documents';
import { bookmarkNames, bookmarkPosition } from './text-document-bookmarks';
import { UNTITLED_HEADING, headingLevel } from './text-document-outline';

/** The context menu's Copy heading link. */
export const HEADING_LINK_COPY_ITEM = 'heading-link-copy';
/** The most headings the link editor offers (default). */
export const HEADING_TARGETS_MAX = 8;
/** How much of a heading's text names it in the link editor's list (default). */
export const HEADING_LABEL_LENGTH = 40;

/** A heading: where its paragraph starts, its id when it has one, and its text. */
export type HeadingPlace = {
  readonly pos: number;
  readonly id: string | null;
  readonly text: string;
};

const nameOf = (node: PmNode): string => {
  const name = (node.attrs as { name: unknown }).name;
  return typeof name === 'string' ? name : '';
};

/** A paragraph's id: the first hidden bookmark before its first text; none when there is none. */
export function headingIdOf(paragraph: PmNode): string | null {
  for (let i = 0; i < paragraph.childCount; i++) {
    const child = paragraph.child(i);
    if (child.isText) return null;
    if (child.type.name === BOOKMARK && Bookmarks.hidden(nameOf(child)) && nameOf(child).length > 1)
      return nameOf(child);
  }
  return null;
}

const textOf = (paragraph: PmNode) => paragraph.textContent.trim();

/** The heading the caret is in, nothing selected; none in body text. */
export function headingAt(state: EditorState, styles: readonly Style[]): HeadingPlace | null {
  const { empty, $from } = state.selection;
  if (!empty || $from.depth !== 1) return null;
  const paragraph = $from.parent;
  if (headingLevel(paragraph, styles) === null) return null;
  return { pos: $from.before(1), id: headingIdOf(paragraph), text: textOf(paragraph) };
}

/** Gives the heading whose paragraph starts at `pos` its id, at its start. */
export function giveHeadingId(pos: number, id: string): Command {
  return (state, dispatch) => {
    const paragraph = state.doc.nodeAt(pos);
    const type = state.schema.nodes[BOOKMARK];
    if (!type || paragraph?.type.name !== 'paragraph') return false;
    dispatch?.(state.tr.insert(pos + 1, type.create({ name: id })));
    return true;
  };
}

/** A heading the link editor offers: where it is, its id when it has one, and what names it. */
export type HeadingTarget = {
  readonly pos: number;
  readonly id: string | null;
  readonly label: string;
};

/** The headings whose text holds every typed word (all, when nothing is typed), at most `max`. */
export function headingTargets(
  doc: PmNode,
  styles: readonly Style[],
  typed: string,
  max = HEADING_TARGETS_MAX,
): HeadingTarget[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const out: HeadingTarget[] = [];
  doc.forEach((block, pos) => {
    if (out.length >= max || headingLevel(block, styles) === null) return;
    const label = (textOf(block) || UNTITLED_HEADING).slice(0, HEADING_LABEL_LENGTH);
    if (words.every((w) => label.toLowerCase().includes(w)))
      out.push({ pos, id: headingIdOf(block), label });
  });
  return out;
}

/** What names the heading a link leads to (its text); none when the name is no heading's id. */
export function headingLabel(doc: PmNode, styles: readonly Style[], name: string): string | null {
  const at = bookmarkPosition(doc, name);
  if (at === null) return null;
  const $at = doc.resolve(at);
  const paragraph = $at.parent;
  if ($at.depth !== 1 || headingLevel(paragraph, styles) === null) return null;
  const id = headingIdOf(paragraph);
  return id !== null && nameOf(doc.nodeAt(at)!) === id
    ? (textOf(paragraph) || UNTITLED_HEADING).slice(0, HEADING_LABEL_LENGTH)
    : null;
}

/** The address part a copied heading link carries, and reading it back. */
export const headingHash = (id: string): string => `#heading=${encodeURIComponent(id)}`;
export function headingOfHash(hash: string): string | null {
  const match = /^#heading=(.+)$/.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

// A small seeded generator (mulberry32), so a heading not yet given an id is offered as the same name each time.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The id the heading whose paragraph starts at `pos` gains when a link first needs it; none the writing holds. */
export const pendingHeadingId = (doc: PmNode, pos: number): string =>
  Bookmarks.newHeadingId(bookmarkNames(doc), seeded(pos + 1));

/** Gives the heading offered as `name` (its id not yet given) that id; false when no heading is offered so. */
export function claimHeadingId(name: string, styles: readonly Style[]): Command {
  return (state, dispatch) => {
    const heading = headingTargets(state.doc, styles, '', Infinity).find(
      (t) => t.id === null && pendingHeadingId(state.doc, t.pos) === name,
    );
    return heading ? giveHeadingId(heading.pos, name)(state, dispatch) : false;
  };
}
