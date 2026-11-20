// Page setup's Apply to (docs/specs/034-text-documents/page-layout.md "Page setup"): a setup set over the whole
// document, the caret's section, from the caret on, or the selected content, making the section breaks the last two
// need; the page colour is always the whole document's. One undo step.
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { SECTION_BREAK, TextDocumentState, type PageSetup } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { insertSectionBreak, sectionSetupAt } from './text-document-breaks';
import { sectionAt } from './pagination/pagination-sections';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

export type ApplyTo = 'document' | 'section' | 'forward' | 'selection';

export const APPLY_TO_LABELS: Record<ApplyTo, string> = {
  document: 'Whole document',
  section: 'This section',
  forward: 'This point forward',
  selection: 'Selected content',
};

const hasSections = (state: EditorState): boolean => {
  let found = false;
  state.doc.forEach((node) => {
    if (node.type.name === SECTION_BREAK) found = true;
  });
  return found;
};

/** What Apply to offers now, in Google's order: This section while there are sections, Selected content while selected. */
export function applyToChoices(state: EditorState): ApplyTo[] {
  return [
    'document',
    ...(hasSections(state) ? (['section'] as const) : []),
    'forward',
    ...(state.selection.empty ? [] : (['selection'] as const)),
  ];
}

// A section's setup with the paper, orientation and margins chosen, its own columns kept.
const onto = (own: PageSetup, { width, height, orientation, margins }: PageSetup): PageSetup => ({
  ...own,
  width,
  height,
  orientation,
  margins,
});

// The document's page colour as chosen: written as the first section's, white as none.
function coloured(first: PageSetup, colour: string | undefined): PageSetup {
  const { pageColor: _was, ...rest } = first;
  return colour ? { ...rest, pageColor: colour } : rest;
}

// A section break starting its section on the next page, with the setup of the section at `pos`.
function nextPageBreak(state: EditorState, tr: Transaction, pos: number, first: PageSetup) {
  return state.schema.nodes[SECTION_BREAK]!.create({
    start: 'next-page',
    setup: sectionSetupAt(tr.doc, pos, first),
  });
}

// The breaks Selected content needs around the paragraphs the selection touches: a next-page one before and after,
// made where none is, a continuous one there made next page. The document's start and end need none.
function enclose(state: EditorState, tr: Transaction, first: PageSetup): void {
  const { $from, $to } = state.selection;
  const before = $from.before(1);
  const after = $to.after(1);
  const next = tr.doc.nodeAt(after);
  if (next?.type.name === SECTION_BREAK) {
    if ((next.attrs as { start: unknown }).start !== 'next-page')
      tr.setNodeAttribute(after, 'start', 'next-page');
  } else if (next) tr.insert(after, nextPageBreak(state, tr, after, first));
  const index = $from.index(0);
  const previous = index > 0 ? tr.doc.child(index - 1) : null;
  if (previous?.type.name === SECTION_BREAK) {
    if ((previous.attrs as { start: unknown }).start !== 'next-page')
      tr.setNodeAttribute(before - previous.nodeSize, 'start', 'next-page');
  } else if (previous) tr.insert(before, nextPageBreak(state, tr, before, first));
}

export type PageScopeChange = {
  readonly tr: Transaction;
  /** The first section's setup as it becomes, or null when it stays. */
  readonly first: PageSetup | null;
  /** How many sections took the setup. */
  readonly sections: number;
};

/** The change Apply to makes: breaks made, each section in scope given the setup, the colour the document's. */
export function pageScopeChange(
  state: EditorState,
  scope: ApplyTo,
  setup: PageSetup,
  first: PageSetup,
): PageScopeChange {
  let tr = state.tr;
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  if (scope === 'section') from = to = sectionAt(state.doc, state.selection.from);
  else if (scope === 'forward') {
    // A next-page break at the caret, a selection left as it is.
    const caret = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.selection.from)),
    );
    insertSectionBreak('next-page', first)(caret, (made) => {
      tr = made;
    });
    from = sectionAt(tr.doc, tr.selection.from);
  } else if (scope === 'selection') {
    enclose(state, tr, first);
    from = to = sectionAt(tr.doc, tr.mapping.map(state.selection.from));
  }
  let sections = 0;
  let section = 0;
  tr.doc.forEach((node, pos) => {
    if (node.type.name !== SECTION_BREAK) return;
    section += 1;
    if (section < from || section > to) return;
    const own = (node.attrs as { setup: PageSetup | null }).setup ?? first;
    tr.setNodeAttribute(pos, 'setup', onto(own, setup));
    sections += 1;
  });
  const inScope = from === 0;
  if (inScope) sections += 1;
  const next = coloured(inScope ? onto(first, setup) : first, setup.pageColor);
  const same = JSON.stringify(next) === JSON.stringify(first);
  return { tr, first: same ? null : next, sections };
}

/** Applies a setup by Apply to as one undo step (page-layout.md "Page setup"). */
export function applyPageTo(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  setup: PageSetup,
  scope: ApplyTo,
): void {
  startUndoStep(view);
  const section = TextDocumentState.section(doc, format);
  const change = pageScopeChange(view.state, scope, setup, section.setup);
  if (change.tr.docChanged) view.dispatch(change.tr);
  if (change.first)
    TextDocumentState.setSection(
      doc,
      { ...section, setup: change.first },
      TEXT_DOCUMENT_PAGE_ORIGIN,
    );
  startUndoStep(view);
  debugLog('[text-document] page setup', { scope, sections: change.sections });
}
