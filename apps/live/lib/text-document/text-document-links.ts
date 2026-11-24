// Links in a text document (docs/specs/034-text-documents/links-and-navigation.md "Links"): the addresses a link may
// hold, the link's whole stretch at the caret, what the link editor opens with and applies as one change, Remove link,
// a LiveDoc document's own address, the link card's title, and opening one safely. Pure, beside `window.open`.
import type { Command, EditorState } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { isSafeFollowUrl, normaliseUrl } from '@/lib/url-safety';

/** Insert > Link, the toolbar's Insert link and the context menu's: opens the link editor. */
export const LINK_ITEM = 'link';
/** Open link (Alt+Enter), a shortcut row of its own. */
export const OPEN_LINK = 'open-link';
/** The context menu's Insert link off a link and Edit link on one (default). */
export const LINK_INSERT_ITEM = 'link-insert';
export const LINK_EDIT_ITEM = 'link-edit';
/** The context menu's Copy link and Remove link, on a link alone. */
export const LINK_COPY_ITEM = 'link-copy';
export const LINK_REMOVE_ITEM = 'link-remove';

/** The longest address a link keeps (default): longer than any address a person types or pastes. */
export const LINK_ADDRESS_MAX = 2048;
export const LINK_REFUSED = 'Use a web, email or LiveDoc address';
export const LINK_TOO_LONG = 'Use a shorter address';

const EMAIL = /^[^\s@:/]+@[^\s@]+\.[a-z]{2,}$/i;

/** What Link holds, as the address kept: '' for no link, or why it is refused. */
export function linkAddress(raw: string): { href: string } | { problem: string } {
  const typed = raw.trim();
  if (typed === '') return { href: '' };
  if (typed.length > LINK_ADDRESS_MAX) return { problem: LINK_TOO_LONG };
  if (typed.startsWith('#')) return { href: typed };
  if (EMAIL.test(typed)) return { href: `mailto:${typed}` };
  const href = /\s/.test(typed) ? null : normaliseUrl(typed);
  return href ? { href } : { problem: LINK_REFUSED };
}

/** A link's whole stretch in its paragraph. */
export type LinkStretch = { from: number; to: number; href: string };

const hrefOf = (node: PmNode | null | undefined): string | null => {
  const mark = node?.marks.find((m) => m.type.name === 'link');
  const href = (mark?.attrs as { href?: unknown } | undefined)?.href;
  return typeof href === 'string' ? href : null;
};

/** The stretch of neighbouring inlines linked to `href` around the inline at `index` of `parent`, from `start`. */
function stretchAround(parent: PmNode, start: number, index: number, href: string): LinkStretch {
  let from = start;
  let to = start;
  const offsets: number[] = [];
  parent.forEach((_, offset) => offsets.push(offset));
  let first = index;
  while (first > 0 && hrefOf(parent.child(first - 1)) === href) first -= 1;
  let last = index;
  while (last < parent.childCount - 1 && hrefOf(parent.child(last + 1)) === href) last += 1;
  from += offsets[first]!;
  to += offsets[last]! + parent.child(last).nodeSize;
  return { from, to, href };
}

/** The link at a position: the inline after it, else the one before it. */
function linkAtPos(doc: PmNode, pos: number): LinkStretch | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.inlineContent) return null;
  const start = $pos.start();
  const after = $pos.index() < parent.childCount ? parent.child($pos.index()) : null;
  const afterHref = hrefOf(after);
  if (after && afterHref !== null) return stretchAround(parent, start, $pos.index(), afterHref);
  // Inside a text node, `index` is that node; before it, the node ending at the caret.
  const beforeIndex = $pos.textOffset > 0 ? $pos.index() : $pos.index() - 1;
  const before = beforeIndex >= 0 ? parent.child(beforeIndex) : null;
  const beforeHref = hrefOf(before);
  return before && beforeHref !== null
    ? stretchAround(parent, start, beforeIndex, beforeHref)
    : null;
}

/** The link at the caret, or holding the whole selection; none otherwise. */
export function linkAt(state: EditorState): LinkStretch | null {
  const { from, to, empty } = state.selection;
  const found = linkAtPos(state.doc, from);
  if (!found) return null;
  return empty || (from >= found.from && to <= found.to) ? found : null;
}

/** What the link editor opens with: Text is null for a selection across paragraphs, which keeps its text. */
export type LinkEditing = { from: number; to: number; text: string | null; href: string };

export function linkEditing(state: EditorState): LinkEditing {
  const found = linkAt(state);
  if (found) return { ...found, text: state.doc.textBetween(found.from, found.to, '', '') };
  const { from, to, $from, $to } = state.selection;
  const oneParagraph = $from.sameParent($to) && $from.parent.inlineContent;
  return {
    from,
    to,
    text: oneParagraph ? state.doc.textBetween(from, to, '', '') : null,
    href: '',
  };
}

/**
 * Applies the link editor as one change: in a link or over a selection, its text (when changed) and the address; at a
 * bare caret, Text (or the address) put in, linked; an empty address removes the link. The caret ends after it.
 */
export function applyLink(edit: LinkEditing): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link;
    if (!type) return false;
    const { from } = edit;
    let { to } = edit;
    const bare = from === to;
    if (bare && edit.href === '') return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const text = bare ? edit.text || edit.href : edit.text;
    const current = state.doc.textBetween(from, to, '', '');
    if (text !== null && text !== '' && text !== current) {
      const at = bare ? state.selection.$from : state.doc.resolve(from + 1);
      const marks: readonly Mark[] = bare ? (state.storedMarks ?? at.marks()) : at.marks();
      tr.replaceWith(from, to, state.schema.text(text, type.removeFromSet(marks)));
      to = from + text.length;
    }
    tr.removeMark(from, to, type);
    if (edit.href !== '') tr.addMark(from, to, type.create({ href: edit.href }));
    tr.setSelection(TextSelection.create(tr.doc, to));
    tr.removeStoredMark(type);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Remove link: the address off the stretch, its text left as it is. */
export function removeLink(from: number, to: number): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link;
    if (!type || from >= to) return false;
    dispatch?.(state.tr.removeMark(from, to, type));
    return true;
  };
}

const DOCUMENT_PATH = /^\/document\/([^/]+)\/?$/;

/** The LiveDoc document an address of this origin names (never the shared landing); none otherwise. */
export function documentIdOf(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const id = DOCUMENT_PATH.exec(url.pathname)?.[1];
  if (!id) return null;
  const decoded = decodeURIComponent(id);
  return decoded === 'shared' ? null : decoded;
}

/** A LiveDoc document's own address in full, so the link opens from any program. */
export const documentAddress = (id: string, origin: string): string =>
  `${origin}/document/${encodeURIComponent(id)}`;

/** A document the person has, as the link editor and card read it. */
export type LinkDocument = { readonly id: string; readonly name: string; readonly savedAt: number };

/** The link card's title: a LiveDoc document's name when it is one of the person's, else the address. */
export function linkTitle(
  href: string,
  documents: readonly LinkDocument[],
  origin: string,
): string {
  const id = documentIdOf(href, origin);
  const name = id === null ? undefined : documents.find((d) => d.id === id)?.name.trim();
  if (name) return name;
  return href.toLowerCase().startsWith('mailto:') ? href.slice('mailto:'.length) : href;
}

/** Opens a web, email or LiveDoc address in a new tab with no opener and no referrer; never any other scheme. */
export function openLink(
  href: string,
  open: (url: string, target: string, features: string) => unknown = (...a) => window.open(...a),
): boolean {
  if (!isSafeFollowUrl(href)) return false;
  open(href, '_blank', 'noopener,noreferrer');
  return true;
}

/** The most documents the Link field offers (default). */
export const LINK_DOCUMENTS_MAX = 8;

/** The documents whose names hold every typed word, newest first, at most LINK_DOCUMENTS_MAX. */
export function matchingDocuments<D extends LinkDocument>(
  documents: readonly D[],
  typed: string,
): D[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return documents
    .filter((d) => {
      const name = d.name.toLowerCase();
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, LINK_DOCUMENTS_MAX);
}
