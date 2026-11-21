// Headers and footers options (docs/specs/034-text-documents/page-layout.md "Editing headers and footers"): a section's
// header and footer margins and its Different first page and Different odd and even, set for that section or every
// section alike, as one step of the body's undo; the first section's in the live state, a later one's on its break.
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  HEADER_FOOTER_MARGIN_PT,
  liveFirstHeaders,
  SECTION_BREAK,
  TextDocumentState,
  type LiveHeaders,
  type PageSetup,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { withSwitch } from './text-document-headers-edit';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

/** What the dialog sets: the two margins (pt) and the section's two switches. */
export type HeaderOptions = {
  readonly header: number;
  readonly footer: number;
  readonly differentFirst: boolean;
  readonly differentOddEven: boolean;
};

export type HeaderOptionsScope = 'section' | 'document';

export const HEADER_OPTIONS_SCOPE_LABELS: Record<HeaderOptionsScope, string> = {
  section: 'This section',
  document: 'Whole document',
};

// The least a page leaves below its header margin: 1 in.
const LEAST_BELOW_PT = 72;

/** A section's options as it has them: 0.5 in for a margin it has none of. */
export function headerOptionsOf(setup: PageSetup, own: LiveHeaders | undefined): HeaderOptions {
  return {
    header: setup.margins.header ?? HEADER_FOOTER_MARGIN_PT,
    footer: setup.margins.footer ?? HEADER_FOOTER_MARGIN_PT,
    differentFirst: own?.differentFirst === true,
    differentOddEven: own?.differentOddEven === true,
  };
}

/** The most a margin takes over these sections: the shortest page's height less 1 in, 0 at least. */
export function headerMarginMost(setups: readonly PageSetup[]): number {
  const shortest = Math.min(...setups.map((setup) => setup.height));
  return Math.max(0, shortest - LEAST_BELOW_PT);
}

// A margin as the model holds it: absent at the default.
const marginEntry = (name: 'header' | 'footer', pt: number) =>
  pt === HEADER_FOOTER_MARGIN_PT ? {} : { [name]: pt };

/** A setup with the options' header and footer margins. */
export function withHeaderOptions(setup: PageSetup, options: HeaderOptions): PageSetup {
  const { header: _header, footer: _footer, ...sides } = setup.margins;
  return {
    ...setup,
    margins: {
      ...sides,
      ...marginEntry('header', options.header),
      ...marginEntry('footer', options.footer),
    },
  };
}

const withSwitches = (own: LiveHeaders | undefined, options: HeaderOptions) =>
  withSwitch(
    withSwitch(own, 'differentFirst', options.differentFirst),
    'differentOddEven',
    options.differentOddEven,
  );

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Sets the options over section `section` or the whole document as one undo step; answers how many sections changed,
 * 0 when none did (then no step is made).
 */
export function applyHeaderOptions(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  change: { section: number; scope: HeaderOptionsScope; options: HeaderOptions },
): number {
  const { section, scope, options } = change;
  const inScope = (index: number) => scope === 'document' || index === section;
  const first = TextDocumentState.section(doc, format);
  const firstHeaders = liveFirstHeaders(doc);
  const tr = view.state.tr;
  let changed = 0;
  // Each section's setup as it was, a break without one following the section before.
  let running = first.setup;
  let index = 0;
  view.state.doc.forEach((node, pos) => {
    if (node.type.name !== SECTION_BREAK) return;
    index += 1;
    const attrs = node.attrs as { setup: PageSetup | null; headers?: LiveHeaders | null };
    const was = attrs.setup ?? running;
    running = was;
    if (!inScope(index)) {
      // A section that followed one changed keeps the setup it had.
      if (!attrs.setup && inScope(index - 1)) tr.setNodeAttribute(pos, 'setup', was);
      return;
    }
    const setup = withHeaderOptions(was, options);
    const headers = withSwitches(attrs.headers ?? undefined, options);
    if (same(setup, was) && same(headers, attrs.headers ?? undefined)) return;
    tr.setNodeAttribute(pos, 'setup', setup);
    tr.setNodeAttribute(pos, 'headers', headers ?? null);
    changed += 1;
  });
  const firstSetup = inScope(0) ? withHeaderOptions(first.setup, options) : first.setup;
  const firstOwn = inScope(0) ? withSwitches(firstHeaders, options) : firstHeaders;
  const setupChanged = !same(firstSetup, first.setup);
  const headersChanged = !same(firstOwn, firstHeaders);
  if (setupChanged || headersChanged) changed += 1;
  if (changed === 0) return 0;
  startUndoStep(view);
  if (tr.docChanged) view.dispatch(tr);
  if (setupChanged)
    TextDocumentState.setSection(doc, { ...first, setup: firstSetup }, TEXT_DOCUMENT_PAGE_ORIGIN);
  if (headersChanged)
    TextDocumentState.setFirstHeaders(doc, format, firstOwn, TEXT_DOCUMENT_PAGE_ORIGIN);
  startUndoStep(view);
  debugLog('[text-document] header footer', {
    section,
    scope,
    sections: changed,
    change: 'options',
  });
  return changed;
}
