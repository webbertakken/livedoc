// Page and section breaks (docs/specs/034-text-documents/page-layout.md "Breaks"): a page break ends the paragraph at
// the caret and gives the rest its own page break before, as both formats hold one; a section break goes between the
// two halves with the setup of the section the caret was in; Backspace and Delete take a page break away before they
// join anything; and the breaks are labelled where breaks are shown.
import type { Node as PmNode } from 'prosemirror-model';
import type { RefObject } from 'react';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { KeptXml } from '@livedoc/office-packages';
import {
  NodeSelection,
  Selection,
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  odfSectionRegion,
  SECTION_BREAK,
  Styles,
  TextDocumentState,
  type PageSetup,
  type ParagraphProps,
  type SectionStart,
} from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { TextFormatting } from './text-document-formatting';
import { startUndoStep } from './text-document-undo';
import { changesTextOnly } from './text-document-text-edits';

/** The class of a paragraph that starts a page by its page break before, labelled where breaks are shown. */
export const BREAK_BEFORE_CLASS = 'text-document-break-before';
/** A paragraph that starts the next column by its own column break before, labelled where breaks are shown. */
export const COLUMN_BREAK_BEFORE_CLASS = 'text-document-column-break-before';

const propsOf = (node: PmNode): ParagraphProps =>
  (node.attrs as { props: ParagraphProps | null }).props ?? {};

/** The page setup of the section `pos` is in: the last section break's before it, else the first section's. */
export function sectionSetupAt(doc: PmNode, pos: number, first: PageSetup): PageSetup {
  let setup = first;
  doc.forEach((node, offset) => {
    if (offset < pos && node.type.name === SECTION_BREAK) {
      const own = (node.attrs as { setup: PageSetup | null }).setup;
      if (own) setup = own;
    }
  });
  return setup;
}

// The ODF regions the document's section breaks hold.
function regionsIn(doc: PmNode): KeptXml[] {
  const regions: KeptXml[] = [];
  doc.forEach((node) => {
    const region = (node.attrs as { region?: KeptXml | null }).region;
    if (node.type.name === SECTION_BREAK && region) regions.push(region);
  });
  return regions;
}

/** The caret's paragraph once a selection is deleted, in the transaction that deletes it; none for a node selected. */
export function caretParagraph(state: EditorState): { tr: Transaction; paragraph: PmNode } | null {
  if (state.selection instanceof NodeSelection) return null;
  const tr = state.tr.deleteSelection();
  const paragraph = tr.selection.$from.parent;
  return paragraph.type.name === 'paragraph' ? { tr, paragraph } : null;
}

// The rest of the paragraph after a break of its own: a page or a column break before.
const insertBreakBefore =
  (key: 'pageBreakBefore' | 'columnBreakBefore'): Command =>
  (state, dispatch) => {
    const place = caretParagraph(state);
    if (!place) return false;
    if (dispatch) {
      const { tr, paragraph } = place;
      const props = { ...propsOf(paragraph), [key]: true };
      tr.split(tr.selection.from, 1, [
        { type: paragraph.type, attrs: { ...paragraph.attrs, props } },
      ]);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** ⌘Enter, Insert > Break > Page break: the rest of the paragraph on a new page. */
export const insertPageBreak: Command = insertBreakBefore('pageBreakBefore');

/** Insert > Break > Column break: the rest of the paragraph at the top of the next column. */
export const insertColumnBreak: Command = insertBreakBefore('columnBreakBefore');

/** Insert > Break > Section break: a new section from the caret, starting on the next page or continuing it. */
export const insertSectionBreak =
  (
    start: Extract<SectionStart, 'next-page' | 'continuous'>,
    first: PageSetup,
    format: TextDocumentFormat = 'odf',
  ): Command =>
  (state, dispatch) => {
    const place = caretParagraph(state);
    if (!place) return false;
    if (dispatch) {
      const { tr, paragraph } = place;
      const $caret = tr.selection.$from;
      const setup = sectionSetupAt(tr.doc, $caret.pos, first);
      // In ODF a continuous section is a region of its own (odf-region.ts).
      const region =
        format === 'odf' && start === 'continuous' ? odfSectionRegion(regionsIn(tr.doc)) : null;
      const sectionBreak = state.schema.nodes[SECTION_BREAK]!.create({ start, setup, region });
      if ($caret.parentOffset === 0) tr.insert($caret.before(), sectionBreak);
      else if ($caret.parentOffset === paragraph.content.size) {
        // At a paragraph's end: the break after it, and an empty paragraph like it to write in.
        const after = $caret.after();
        const rest = paragraph.type.create({ ...paragraph.attrs, props: null });
        tr.insert(after, [sectionBreak, rest]);
        tr.setSelection(Selection.near(tr.doc.resolve(after + sectionBreak.nodeSize + 1)));
      } else {
        tr.split($caret.pos);
        tr.insert(tr.selection.$from.before(), sectionBreak);
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

// A paragraph's own break before: a page break, else a column break, else none.
const ownBreak = (node: PmNode): 'pageBreakBefore' | 'columnBreakBefore' | null =>
  propsOf(node).pageBreakBefore
    ? 'pageBreakBefore'
    : propsOf(node).columnBreakBefore
      ? 'columnBreakBefore'
      : null;

// A paragraph's own break before taken away (a page break first), its other formatting kept.
function withoutBreak(tr: Transaction, pos: number, node: PmNode): Transaction {
  const { [ownBreak(node) ?? 'pageBreakBefore']: _gone, ...rest } = propsOf(node);
  return tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    props: Object.keys(rest).length > 0 ? rest : null,
  });
}

/** Backspace at the start of a paragraph with its own page or column break before takes the break away. */
export const removePageBreakBackward: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph') return false;
  if (!ownBreak($from.parent)) return false;
  dispatch?.(withoutBreak(state.tr, $from.before(), $from.parent));
  return true;
};

/** Delete at the end of the paragraph before one with its own page or column break before takes the break away. */
export const removePageBreakForward: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  const after = $from.after();
  const next = state.doc.nodeAt(after);
  if (!next || next.type.name !== 'paragraph' || !ownBreak(next)) return false;
  dispatch?.(withoutBreak(state.tr, after, next));
  return true;
};

/** The paragraphs that start a page by their page break before, their own or their style's, marked to be labelled. */
export function breakLabels(doc: PmNode, formatting: TextFormatting): DecorationSet {
  const { styles, defaults } = formatting;
  const normal = Styles.idOfRole(styles, 'normal');
  const byStyle = new Map<string, boolean>();
  const decorations: Decoration[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const style = (node.attrs as { style: string | null }).style ?? normal ?? '';
    let styled = byStyle.get(style);
    if (styled === undefined) {
      styled = Styles.paragraphPropsOf(styles, defaults, style).pageBreakBefore === true;
      byStyle.set(style, styled);
    }
    const own = propsOf(node).pageBreakBefore;
    if (own ?? styled)
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: BREAK_BEFORE_CLASS }));
    else if (propsOf(node).columnBreakBefore)
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: COLUMN_BREAK_BEFORE_CLASS }),
      );
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const key = new PluginKey<DecorationSet>('textDocumentBreaks');

/** The breaks' labels, and Backspace and Delete beside a page break. */
export function breaksPlugin(readFormatting: () => TextFormatting): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => breakLabels(state.doc, readFormatting()),
      // An edit of text keeps every paragraph's break (performance.md "A keystroke's frame").
      apply: (tr, set) =>
        !tr.docChanged
          ? set
          : changesTextOnly(tr)
            ? set.map(tr.mapping, tr.doc)
            : breakLabels(tr.doc, readFormatting()),
    },
    props: {
      decorations: (state) => key.getState(state),
      handleKeyDown: (view, event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        const command =
          event.key === 'Backspace'
            ? removePageBreakBackward
            : event.key === 'Delete'
              ? removePageBreakForward
              : null;
        if (!command || !command(view.state)) return false;
        // One undo step of its own.
        startUndoStep(view);
        command(view.state, view.dispatch);
        startUndoStep(view);
        return true;
      },
    },
  });
}

const BREAK_TYPES = {
  'page-break': 'TextDocumentBreakPage',
  'column-break': 'TextDocumentBreakColumn',
  'section-break-next-page': 'TextDocumentBreakSectionNextPage',
  'section-break-continuous': 'TextDocumentBreakSectionContinuous',
} as const;

/** Insert > Break's items, for an Editor; Column break dimmed while the caret's section has one column. */
export function textDocumentBreakActions(
  view: EditorView | null,
  {
    canEdit,
    liveDoc,
    format,
    columns = 1,
  }: {
    canEdit: boolean;
    liveDoc: RefObject<Y.Doc | null>;
    format: TextDocumentFormat;
    // The caret's section's columns (one where columns are not drawn).
    columns?: number;
  },
): OfficeActions {
  if (!canEdit) return {};
  const run = (item: keyof typeof BREAK_TYPES) => () => {
    const doc = liveDoc.current;
    if (!view || !doc) return;
    const first = TextDocumentState.section(doc, format).setup;
    const command =
      item === 'page-break'
        ? insertPageBreak
        : item === 'column-break'
          ? insertColumnBreak
          : insertSectionBreak(
              item === 'section-break-next-page' ? 'next-page' : 'continuous',
              first,
              format,
            );
    // A step of its own: the writing before it and after it undo apart.
    startUndoStep(view);
    if (command(view.state, view.dispatch)) {
      startUndoStep(view);
      track('Element', 'Added', BREAK_TYPES[item]);
      debugLog('[text-document] break', { kind: item });
    }
    view.focus();
  };
  return {
    'page-break': { run: run('page-break') },
    'column-break': { run: run('column-break'), disabled: columns < 2 },
    'section-break-next-page': { run: run('section-break-next-page') },
    'section-break-continuous': { run: run('section-break-continuous') },
  };
}
