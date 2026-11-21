// Putting page numbers in (docs/specs/034-text-documents/page-layout.md "Page numbers"): Insert > Page numbers'
// presets and the Page numbers dialog put a page number, aligned right, in the default header or footer each section
// in scope shows, and its even page one where it has one; Not the first page switches Different first page on and
// takes the numbers out of that header. A header changed so is written as a new copy the section names, so the whole
// change is one step of the body's undo. Page count goes in at the caret.
import type { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  FIELD,
  HeadersAndFooters,
  liveFirstHeaders,
  SECTION_BREAK,
  storyFragment,
  TextDocumentState,
  type FieldKind,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type LiveHeaders,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { withSlot, withSwitch } from './text-document-headers-edit';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

export type PageNumberScope = 'section' | 'document';

/** What is asked: where, whether on the first page, where numbering starts (`null` continues; absent leaves it). */
export type PageNumberChoice = {
  readonly position: HeaderFooterKind;
  readonly firstPage: boolean;
  readonly scope: PageNumberScope;
  /** The section the change is for; the first, for the whole document. */
  readonly section: number;
  readonly start?: number | null;
};

/** Insert > Page numbers' four presets, as rows (page-layout.md "Page numbers"). */
export const PAGE_NUMBER_PRESETS = [
  { item: 'page-numbers-header', label: 'Header, every page', position: 'header', firstPage: true },
  {
    item: 'page-numbers-header-skip-first',
    label: 'Header, not the first page',
    position: 'header',
    firstPage: false,
  },
  { item: 'page-numbers-footer', label: 'Footer, every page', position: 'footer', firstPage: true },
  {
    item: 'page-numbers-footer-skip-first',
    label: 'Footer, not the first page',
    position: 'footer',
    firstPage: false,
  },
] as const satisfies readonly {
  item: string;
  label: string;
  position: HeaderFooterKind;
  firstPage: boolean;
}[];

/** The text a field holds when it is put: the file's last drawn text, worked out again by other suites. */
const PUT_TEXT = '1';

/** A field element of the live state. */
export function fieldElement(kind: FieldKind, props?: object): Y.XmlElement {
  const element = new Y.XmlElement(FIELD);
  element.setAttribute('field', kind);
  element.setAttribute('text', PUT_TEXT);
  if (props && Object.keys(props).length > 0) element.setAttribute('props', props as never);
  return element;
}

const isPageNumber = (node: unknown): boolean =>
  node instanceof Y.XmlElement &&
  node.nodeName === FIELD &&
  node.getAttribute('field') === 'page-number';

const hasPageNumber = (paragraphs: readonly unknown[]): boolean =>
  paragraphs.some((p) => p instanceof Y.XmlElement && p.toArray().some(isPageNumber));

const isEmptyParagraph = (node: Y.XmlElement | Y.XmlText | undefined): node is Y.XmlElement =>
  node instanceof Y.XmlElement &&
  node.nodeName === 'paragraph' &&
  node.toArray().every((child) => child instanceof Y.XmlText && child.length === 0);

// A new story holding a copy of story `id`'s writing (none for no story), changed in place once it is laid in.
function copied(doc: Y.Doc, id: string | undefined, change: (copy: Y.XmlFragment) => void): string {
  const copy = crypto.randomUUID();
  const blocks =
    id === undefined
      ? []
      : storyFragment(doc, id)
          .toArray()
          .map((node) => node.clone() as Y.XmlElement | Y.XmlText);
  doc.transact(() => {
    const fragment = storyFragment(doc, copy);
    fragment.insert(0, blocks);
    change(fragment);
  });
  return copy;
}

const alignedEnd = (paragraph: Y.XmlElement) => {
  const props = (paragraph.getAttribute('props') as unknown as object | undefined) ?? {};
  paragraph.setAttribute('props', { ...props, align: 'end' } as never);
};

/**
 * A story holding a page number: `id` itself when it holds one, else a new copy of it with one (in its one empty
 * paragraph, or a new paragraph at its end), aligned right; a new story when there is none.
 */
export function numberedStory(doc: Y.Doc, id: string | undefined): string {
  if (id !== undefined && hasPageNumber(storyFragment(doc, id).toArray())) return id;
  return copied(doc, id, (fragment) => {
    const only = fragment.length === 1 ? fragment.get(0) : undefined;
    if (isEmptyParagraph(only as Y.XmlElement | undefined)) {
      const paragraph = only as Y.XmlElement;
      alignedEnd(paragraph);
      paragraph.insert(paragraph.length, [fieldElement('page-number')]);
      return;
    }
    const paragraph = new Y.XmlElement('paragraph');
    fragment.insert(fragment.length, [paragraph]);
    alignedEnd(paragraph);
    paragraph.insert(0, [fieldElement('page-number')]);
  });
}

/** A story without page numbers: `id` itself when it holds none, else a new copy without them. */
export function unnumberedStory(doc: Y.Doc, id: string): string {
  if (!hasPageNumber(storyFragment(doc, id).toArray())) return id;
  return copied(doc, id, (fragment) => {
    for (const block of fragment.toArray())
      if (block instanceof Y.XmlElement)
        for (let at = block.length - 1; at >= 0; at -= 1)
          if (isPageNumber(block.get(at))) block.delete(at, 1);
  });
}

// Each section's own headers and start, as the change goes on.
type Own = { headers: LiveHeaders | undefined; start: number | undefined };

const ownOf = (view: EditorView, doc: Y.Doc, format: TextDocumentFormat): Own[] => {
  const first: Own = {
    headers: liveFirstHeaders(doc),
    start: TextDocumentState.section(doc, format).numberStart,
  };
  const later: Own[] = [];
  view.state.doc.forEach((node) => {
    if (node.type.name !== SECTION_BREAK) return;
    const attrs = node.attrs as { headers?: LiveHeaders | null; numberStart?: number | null };
    later.push({
      headers: attrs.headers ?? undefined,
      start: typeof attrs.numberStart === 'number' ? attrs.numberStart : undefined,
    });
  });
  return [first, ...later];
};

/** The sections after the change: page numbers put where the choice asks. */
export function numberedSections(
  doc: Y.Doc,
  sections: readonly Own[],
  choice: PageNumberChoice,
): Own[] {
  const out = sections.map((s) => ({ ...s }));
  const { position, firstPage, scope, section } = choice;
  const inScope = (i: number) => scope === 'document' || i === section;
  // The section whose first page Not the first page leaves bare.
  const firstOf = scope === 'document' ? 0 : section;
  const changed = new Map<string, string>();
  const once = (id: string | undefined, make: (id: string | undefined) => string) => {
    if (id === undefined) return make(undefined);
    if (!changed.has(id)) changed.set(id, make(id));
    return changed.get(id)!;
  };
  const shown = (i: number, slot: HeaderFooterSlot): string | undefined =>
    HeadersAndFooters.resolve(out.map((s) => s.headers))[i]?.[position][slot]?.story;
  const set = (i: number, slot: HeaderFooterSlot, story: string) => {
    out[i]!.headers = withSlot(out[i]!.headers, position, slot, story);
  };
  out.forEach((own, i) => {
    if (!inScope(i)) return;
    // The default one it shows: its own, or the previous section's when linked, numbered.
    const shownDefault = shown(i, 'default');
    const ownDefault = own.headers?.[position]?.default?.story;
    if (ownDefault !== undefined || shownDefault === undefined || !storyHolds(doc, shownDefault))
      set(
        i,
        'default',
        once(ownDefault ?? shownDefault, (id) => numberedStory(doc, id)),
      );
    // Its even page one, where it has one.
    const even = own.headers?.[position]?.even?.story;
    if (own.headers?.differentOddEven && even !== undefined)
      set(
        i,
        'even',
        once(even, (id) => numberedStory(doc, id)),
      );
    // Its first page one: bare for Not the first page, numbered for every page where it has one.
    if (i === firstOf && !firstPage) {
      out[i]!.headers = withSwitch(out[i]!.headers, 'differentFirst', true);
      const first = out[i]!.headers?.[position]?.first?.story;
      if (first !== undefined) set(i, 'first', unnumberedStory(doc, first));
    } else if (firstPage && out[i]!.headers?.differentFirst) {
      const first = out[i]!.headers?.[position]?.first?.story;
      if (first !== undefined)
        set(
          i,
          'first',
          once(first, (id) => numberedStory(doc, id)),
        );
    }
    if (choice.start !== undefined) {
      const starts = scope === 'section' || i === 0;
      own.start = starts && choice.start !== null ? choice.start : undefined;
    }
  });
  return out;
}

const storyHolds = (doc: Y.Doc, id: string) => hasPageNumber(storyFragment(doc, id).toArray());

/** Puts page numbers in as the choice asks, as one step of the body's undo; answers whether anything changed. */
export function applyPageNumbers(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  choice: PageNumberChoice,
): boolean {
  const before = ownOf(view, doc, format);
  const after = numberedSections(doc, before, choice);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (after.every((s, i) => same(s, before[i]))) return false;
  startUndoStep(view);
  const tr = view.state.tr;
  let index = 0;
  view.state.doc.forEach((node, pos) => {
    if (node.type.name !== SECTION_BREAK) return;
    index += 1;
    const next = after[index]!;
    if (!same(next, before[index])) {
      tr.setNodeAttribute(pos, 'headers', next.headers ?? null);
      tr.setNodeAttribute(pos, 'numberStart', next.start ?? null);
    }
  });
  if (tr.docChanged) view.dispatch(tr);
  if (!same(after[0]!.headers, before[0]!.headers))
    TextDocumentState.setFirstHeaders(doc, format, after[0]!.headers, TEXT_DOCUMENT_PAGE_ORIGIN);
  if (after[0]!.start !== before[0]!.start) {
    const { numberStart: _, ...section } = TextDocumentState.section(doc, format);
    TextDocumentState.setSection(
      doc,
      { ...section, ...(after[0]!.start !== undefined ? { numberStart: after[0]!.start } : {}) },
      TEXT_DOCUMENT_PAGE_ORIGIN,
    );
  }
  startUndoStep(view);
  debugLog('[text-document] page numbers', {
    position: choice.position,
    firstPage: choice.firstPage,
    start: choice.start,
    scope: choice.scope,
  });
  return true;
}
