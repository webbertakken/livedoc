// Format > Columns (docs/specs/034-text-documents/page-layout.md "Columns"): the caret's section's columns, or, with
// text selected, the columns of a section of its own, continuous section breaks made before and after the paragraphs
// it touches where none is. One undo step with the breaks it makes.
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  Columns,
  odfSectionRegion,
  SECTION_BREAK,
  TextDocumentState,
  type PageSetup,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { sectionAt } from './pagination/pagination-sections';
import { sectionSetupAt } from './text-document-breaks';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

/** The columns of the section the caret is in. */
export const columnsAt = (state: EditorState, first: PageSetup): Columns =>
  Columns.of(sectionSetupAt(state.doc, state.selection.from, first));

export type ColumnsChange = {
  readonly tr: Transaction;
  /** The first section's setup as it becomes, or null when it stays. */
  readonly first: PageSetup | null;
  /** How many sections took the columns: 0 when nothing changed. */
  readonly sections: number;
};

// Where the body's child `index` starts.
function childStart(doc: PmNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

const isBreak = (node: PmNode | null | undefined) => node?.type.name === SECTION_BREAK;

// The continuous section breaks the selection's own section needs, made where none is; a break there stays.
function enclose(
  state: EditorState,
  tr: Transaction,
  first: PageSetup,
  format: TextDocumentFormat,
): void {
  const { doc } = state;
  const fromIndex = state.selection.$from.index(0);
  const toIndex = state.selection.$to.index(0);
  const regions: { xml: string; ns: Record<string, string> }[] = [];
  doc.forEach((node) => {
    const region = (node.attrs as { region?: (typeof regions)[number] | null }).region;
    if (isBreak(node) && region) regions.push(region);
  });
  const continuous = (pos: number) => {
    // In ODF a continuous section is a region of its own (odf-region.ts), named apart from the others.
    const region = format === 'odf' ? odfSectionRegion(regions) : null;
    if (region) regions.push(region);
    return state.schema.nodes[SECTION_BREAK]!.create({
      start: 'continuous',
      setup: sectionSetupAt(doc, pos, first),
      region,
    });
  };
  const after = childStart(doc, toIndex + 1);
  const next = toIndex + 1 < doc.childCount ? doc.child(toIndex + 1) : null;
  const previous = fromIndex > 0 ? doc.child(fromIndex - 1) : null;
  const before = childStart(doc, fromIndex);
  // The later one first, so the earlier place still holds.
  if (next && !isBreak(next)) tr.insert(after, continuous(after));
  if (previous && !isBreak(previous)) tr.insert(before, continuous(before));
}

/** The change Format > Columns makes, pure: breaks made for a selection, the section's columns set. */
export function columnsChange(
  state: EditorState,
  columns: Columns,
  first: PageSetup,
  format: TextDocumentFormat,
): ColumnsChange {
  const tr = state.tr;
  const { selection } = state;
  const sectionFrom = sectionAt(state.doc, selection.from);
  const sectionTo = sectionAt(state.doc, selection.to);
  // Already so throughout: nothing to make or set.
  const unchanged =
    sectionFrom === sectionTo &&
    Columns.equal(Columns.of(sectionSetupAt(state.doc, selection.from, first)), columns);
  if (unchanged) return { tr, first: null, sections: 0 };
  if (!selection.empty) enclose(state, tr, first, format);
  const index = sectionAt(tr.doc, tr.mapping.map(selection.from));
  if (index === 0) return { tr, first: Columns.onto(first, columns), sections: 1 };
  let seen = 0;
  tr.doc.forEach((node, pos) => {
    if (!isBreak(node)) return;
    seen += 1;
    if (seen !== index) return;
    const own =
      (node.attrs as { setup: PageSetup | null }).setup ?? sectionSetupAt(tr.doc, pos, first);
    tr.setNodeAttribute(pos, 'setup', Columns.onto(own, columns));
  });
  return { tr, first: null, sections: 1 };
}

/** Sets columns as Format > Columns does, one undo step (page-layout.md "Columns"); answers whether anything changed. */
export function applyColumns(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  columns: Columns,
): boolean {
  const section = TextDocumentState.section(doc, format);
  const change = columnsChange(view.state, columns, section.setup, format);
  if (change.sections === 0) return false;
  startUndoStep(view);
  if (change.tr.docChanged) view.dispatch(change.tr);
  if (change.first)
    TextDocumentState.setSection(
      doc,
      { ...section, setup: change.first },
      TEXT_DOCUMENT_PAGE_ORIGIN,
    );
  startUndoStep(view);
  debugLog('[text-document] columns', {
    count: columns.count,
    scope: view.state.selection.empty ? 'section' : 'selection',
    sections: change.sections,
  });
  return true;
}
