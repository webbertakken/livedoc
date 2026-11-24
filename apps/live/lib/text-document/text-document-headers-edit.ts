// Making and removing a section's own headers and footers (docs/specs/034-text-documents/page-layout.md "Editing
// headers and footers"): a section's own headers as the live state names them, set as a step of the body's undo (the
// first section's in the document map, a later one's on its section break); a new header one empty paragraph under a
// new random id; one left empty taken out of its section again.
import type { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  HeadersAndFooters,
  liveFirstHeaders,
  liveSectionHeaders,
  SECTION_BREAK,
  storyFragment,
  TextDocumentState,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type LiveHeaders,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

// Where section `index`'s break is in the body (section 0 has none).
function breakAt(view: EditorView, index: number): number {
  let seen = 0;
  let at = -1;
  view.state.doc.forEach((node, pos) => {
    if (node.type.name !== SECTION_BREAK || at >= 0) return;
    seen += 1;
    if (seen === index) at = pos;
  });
  return at;
}

/**
 * Each section's own headers in the body the editor shows: the first section's from the document map, then each
 * section break's (links-and-navigation.md "Document tabs in the outline": every tab starts in the first section).
 */
export function shownSectionHeaders(view: EditorView, doc: Y.Doc): (LiveHeaders | undefined)[] {
  const later: (LiveHeaders | undefined)[] = [];
  view.state.doc.forEach((node) => {
    if (node.type.name === SECTION_BREAK)
      later.push((node.attrs as { headers?: LiveHeaders | null }).headers ?? undefined);
  });
  return [liveFirstHeaders(doc), ...later];
}

/** Section `index`'s own headers and footers, as the live state names them. */
export function liveHeadersOf(
  view: EditorView,
  doc: Y.Doc,
  index: number,
): LiveHeaders | undefined {
  if (index === 0) return liveFirstHeaders(doc);
  const at = breakAt(view, index);
  if (at < 0) return undefined;
  return (
    (view.state.doc.nodeAt(at)!.attrs as { headers?: LiveHeaders | null }).headers ?? undefined
  );
}

/** Sets section `index`'s own headers and footers as one step of the body's undo; false when there is no such section. */
export function setLiveHeaders(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  index: number,
  headers: LiveHeaders | undefined,
): boolean {
  startUndoStep(view);
  if (index === 0)
    TextDocumentState.setFirstHeaders(doc, format, headers, TEXT_DOCUMENT_PAGE_ORIGIN);
  else {
    const at = breakAt(view, index);
    if (at < 0) return false;
    view.dispatch(view.state.tr.setNodeAttribute(at, 'headers', headers ?? null));
  }
  startUndoStep(view);
  return true;
}

/** The headers with `kind`'s `slot` naming `story`, or with it taken away; a kind left with no slot goes. */
export function withSlot(
  headers: LiveHeaders | undefined,
  kind: HeaderFooterKind,
  slot: HeaderFooterSlot,
  story: string | undefined,
): LiveHeaders | undefined {
  const { [slot]: _, ...others } = headers?.[kind] ?? {};
  const set = story ? { ...others, [slot]: { story } } : others;
  const { [kind]: __, ...rest } = headers ?? {};
  const next: LiveHeaders = { ...rest, ...(Object.keys(set).length > 0 ? { [kind]: set } : {}) };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The headers with a section's own setting switched on or off; nothing left is none. */
export function withSwitch(
  headers: LiveHeaders | undefined,
  name: 'differentFirst' | 'differentOddEven',
  on: boolean,
): LiveHeaders | undefined {
  const { [name]: _, ...rest } = headers ?? {};
  const next: LiveHeaders = on ? { ...rest, [name]: true } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The header or footer a page shows, read from the live state now: its slot, its story if any, whether it is linked
 * to the previous section's (the section has none of its own in that slot), and the section's own Different first
 * page.
 */
export function shownStory(
  doc: Y.Doc,
  kind: HeaderFooterKind,
  section: number,
  first: boolean,
  number: number,
  // Each section's own headers: the first tab's, unless those of the tab shown are given (shownSectionHeaders).
  all: readonly (LiveHeaders | undefined)[] = liveSectionHeaders(doc),
): { slot: HeaderFooterSlot; story?: string; linked: boolean; differentFirst: boolean } {
  const resolved = HeadersAndFooters.resolve(all)[section];
  const own = all[section];
  const slot = HeadersAndFooters.slotOf(resolved, first, number);
  const story = resolved?.[kind][slot]?.story;
  return {
    slot,
    ...(typeof story === 'string' ? { story } : {}),
    linked: section > 0 && own?.[kind]?.[slot] === undefined,
    differentFirst: own?.differentFirst === true,
  };
}

/** A copy of a story's writing under a new random id: the copy is its own (unlinking, Word's). */
export function copyStory(doc: Y.Doc, id: string): string {
  const copy = crypto.randomUUID();
  const blocks = storyFragment(doc, id)
    .toArray()
    .map((node) => node.clone() as Y.XmlElement | Y.XmlText);
  doc.transact(() => storyFragment(doc, copy).insert(0, blocks));
  return copy;
}

/** A new story: one empty paragraph in Normal text, under a new random id. */
export function makeStory(doc: Y.Doc): string {
  const id = crypto.randomUUID();
  doc.transact(() => storyFragment(doc, id).insert(0, [new Y.XmlElement('paragraph')]));
  return id;
}

/** Whether a story holds no writing: no paragraph, or one with no characters. */
export function isStoryEmpty(doc: Y.Doc, id: string): boolean {
  const paragraphs = TextDocumentState.storyParagraphs(doc, id);
  return paragraphs.length === 0 || (paragraphs.length === 1 && paragraphs[0]!.text === '');
}

/**
 * Takes an empty story out of section `index`'s own `kind` slot, where it is that section's own; answers whether it
 * did. A linked one, the previous section's, stays.
 */
export function removeIfEmpty(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  where: { index: number; kind: HeaderFooterKind; slot: HeaderFooterSlot; story: string },
): boolean {
  const own = liveHeadersOf(view, doc, where.index);
  if (own?.[where.kind]?.[where.slot]?.story !== where.story || !isStoryEmpty(doc, where.story))
    return false;
  setLiveHeaders(view, doc, format, where.index, withSlot(own, where.kind, where.slot, undefined));
  debugLog('[text-document] header footer', {
    section: where.index,
    kind: where.kind,
    slot: where.slot,
    change: 'removed',
  });
  return true;
}
