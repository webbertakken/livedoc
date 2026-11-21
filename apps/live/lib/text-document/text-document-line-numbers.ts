// Line numbers (docs/specs/034-text-documents/page-layout.md "Line numbers", "The panel"): each section's own, read as
// the live state holds them (the first section's in the document map, a later one's on its section break), and a
// choice from the Line numbers panel set over the caret's section or the whole document as one step of the body's undo.
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  SECTION_BREAK,
  TextDocumentState,
  type LineNumberRestart,
  type LineNumbers,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

/** The restart a section takes when its numbers are turned on (default). */
export const DEFAULT_LINE_NUMBER_RESTART: LineNumberRestart = 'continuous';

export type LineNumbersScope = 'document' | 'section';

export const LINE_NUMBERS_SCOPE_LABELS: Record<LineNumbersScope, string> = {
  document: 'Entire document',
  section: 'This section',
};

export const LINE_NUMBER_RESTART_LABELS: Record<LineNumberRestart, string> = {
  continuous: 'Continue throughout the document',
  page: 'Restart on each page',
  section: 'Restart on each section',
};

/** What the panel sets: shown or not and how they restart, over section `section` or the whole document. */
export type LineNumbersChoice = {
  readonly section: number;
  readonly scope: LineNumbersScope;
  readonly shown: boolean;
  readonly restart: LineNumberRestart;
};

type Own = LineNumbers | undefined;

const lineNumbersAttr = (value: unknown): Own =>
  value && typeof value === 'object' ? (value as LineNumbers) : undefined;

/** Each section's line numbers, the first section's first; none where a section has none. */
export function sectionLineNumbers(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
): Own[] {
  const out: Own[] = [TextDocumentState.section(doc, format).lineNumbers];
  view.state.doc.forEach((node) => {
    if (node.type.name === SECTION_BREAK)
      out.push(lineNumbersAttr((node.attrs as { lineNumbers?: unknown }).lineNumbers));
  });
  return out;
}

/** The sections' line numbers once the choice is made; a file's own count-by stays with a section still numbered. */
export function withLineNumbers(own: readonly Own[], choice: LineNumbersChoice): Own[] {
  return own.map((was, index) => {
    if (choice.scope === 'section' && index !== choice.section) return was;
    if (!choice.shown) return undefined;
    return {
      restart: choice.restart,
      ...(was?.countBy !== undefined ? { countBy: was.countBy } : {}),
    };
  });
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Applies the choice as one undo step; answers how many sections changed, 0 when none did (then no step is made). */
export function applyLineNumbers(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  choice: LineNumbersChoice,
): number {
  const before = sectionLineNumbers(view, doc, format);
  const after = withLineNumbers(before, choice);
  const changed = after.filter((next, index) => !same(next, before[index])).length;
  if (changed === 0) return 0;
  startUndoStep(view);
  const tr = view.state.tr;
  let index = 0;
  view.state.doc.forEach((node, pos) => {
    if (node.type.name !== SECTION_BREAK) return;
    index += 1;
    if (!same(after[index], before[index]))
      tr.setNodeAttribute(pos, 'lineNumbers', after[index] ?? null);
  });
  if (tr.docChanged) view.dispatch(tr);
  if (!same(after[0], before[0])) {
    const { lineNumbers: _, ...section } = TextDocumentState.section(doc, format);
    TextDocumentState.setSection(
      doc,
      { ...section, ...(after[0] ? { lineNumbers: after[0] } : {}) },
      TEXT_DOCUMENT_PAGE_ORIGIN,
    );
  }
  startUndoStep(view);
  debugLog('[text-document] line numbers', {
    section: choice.section,
    scope: choice.scope,
    shown: choice.shown,
    restart: choice.restart,
    sections: changed,
  });
  return changed;
}
