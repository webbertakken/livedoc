// Code blocks in the writing (docs/specs/034-text-documents/objects.md "Code blocks"): Insert > Building blocks > Code
// blocks > a language makes one paragraph in that language's code style, its lines split by line breaks; Enter starts
// a new line in it, keeping the line's indent, and on an empty last line leaves it for a Normal text paragraph.
import type { Node as PmNode } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { TextSelection, type Command, type EditorState, type Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  CODE_BLOCK_LANGUAGES,
  CodeBlocks,
  type CodeBlockLanguage,
  type Style,
} from '@livedoc/text-documents';
import type { TokenLanguage } from '@/lib/code-tokens';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { placeBlocks } from './text-document-block-place';
import { selectedParagraphs } from './text-document-paragraphs';
import { textDocumentSchema as schema } from './text-document-schema';
import { startUndoStep } from './text-document-undo';

/** Insert > Building blocks > Code blocks' items, one per language, in Google's order. */
export const CODE_BLOCK_ITEMS: readonly {
  readonly language: CodeBlockLanguage;
  readonly item: string;
  readonly label: string;
}[] = CODE_BLOCK_LANGUAGES.map(({ id, label }) => ({
  language: id,
  item: `code-block-${id}`,
  label,
}));

/** The tokenizer's language for each code block language. */
export const TOKEN_LANGUAGES: Readonly<Record<CodeBlockLanguage, TokenLanguage>> = {
  c: 'c',
  csharp: 'csharp',
  css: 'css',
  go: 'go',
  html: 'html',
  java: 'java',
  javascript: 'js',
  json: 'json',
  kotlin: 'kotlin',
  php: 'php',
  protobuf: 'protobuf',
  python: 'python',
  rust: 'rust',
  shell: 'bash',
  sql: 'sql',
  textproto: 'textproto',
  typescript: 'ts',
  xml: 'xml',
};

const styleIdOf = (node: PmNode): string | null => {
  const style = (node.attrs as { style: unknown }).style;
  return typeof style === 'string' ? style : null;
};

/** The code block a paragraph is, if it is one. */
export const codeBlockOf = (node: PmNode, styles: readonly Style[]) =>
  node.type.name === 'paragraph' ? CodeBlocks.of(styles, styleIdOf(node)) : undefined;

/** Whether the caret's paragraph is a code block. */
export const inCodeBlock = (state: EditorState, styles: readonly Style[]): boolean =>
  codeBlockOf(state.selection.$from.parent, styles) !== undefined;

const asCode = (node: PmNode, styleId: string) => ({
  ...node.attrs,
  style: styleId,
  props: null,
  list: null,
});

/**
 * Makes a code block of style `styleId`: a selection's paragraphs (those beside the first) joined by line breaks
 * into one; an empty paragraph at the caret restyled; else an empty block put in at the caret as a table goes in.
 */
export const insertCodeBlock =
  (styleId: string): Command =>
  (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!$from.parent.isTextblock) return false;
    const tr = state.tr;
    if (!empty) {
      const first = selectedParagraphs(state)[0]!;
      const parent = state.doc.resolve(first.pos).parent;
      const siblings = selectedParagraphs(state).filter(
        ({ pos }) => state.doc.resolve(pos).parent === parent,
      );
      // From the last join back, so the earlier positions hold: the boundary between two paragraphs becomes a break.
      for (let i = siblings.length - 1; i > 0; i--) {
        const before = siblings[i - 1]!;
        const after = siblings[i]!;
        tr.replaceWith(before.pos + before.node.nodeSize - 1, after.pos + 1, schema.text('\n'));
      }
      tr.setNodeMarkup(first.pos, undefined, asCode(first.node, styleId));
      const block = tr.doc.nodeAt(first.pos)!;
      tr.setSelection(TextSelection.create(tr.doc, first.pos + block.nodeSize - 1));
    } else if ($from.parent.content.size === 0) {
      tr.setNodeMarkup($from.before(), undefined, asCode($from.parent, styleId));
    } else {
      const at = placeBlocks(tr, [schema.nodes.paragraph!.create({ style: styleId })]);
      if (at === null) return false;
      tr.setSelection(TextSelection.create(tr.doc, at + 1));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };

/**
 * Enter in a code block: a new line keeping the line's leading spaces and tabs; on a last line of nothing but spaces
 * and tabs, that line taken away and a Normal text paragraph started after the block.
 */
export const enterInCodeBlock =
  (readStyles: () => readonly Style[]): Command =>
  (state, dispatch) => {
    const { $from, $to } = state.selection;
    if (!inCodeBlock(state, readStyles()) || !$from.sameParent($to)) return false;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
    const line = before.slice(before.lastIndexOf('\n') + 1);
    const atEnd = $to.parentOffset === $to.parent.content.size;
    if (dispatch) {
      const tr = state.tr;
      if (atEnd && /^[ \t]*$/.test(line) && before.length > line.length && state.selection.empty) {
        // The blank last line and its break go; the caret starts a Normal text paragraph after the block.
        const from = $from.pos - line.length - 1;
        tr.delete(from, $from.pos);
        tr.split(from, 1, [{ type: schema.nodes.paragraph!, attrs: { style: null } }]);
      } else {
        const indent = /^[ \t]*/.exec(line)![0];
        tr.insertText(`\n${indent}`, $from.pos, $to.pos);
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** Enter in a code block where the writing takes edits, bound ahead of the lists' and the writing's. */
export function codeBlockKeysPlugin(readStyles: () => readonly Style[]): Plugin {
  return keymap({
    Enter: (state, dispatch, view) =>
      view?.editable === true && enterInCodeBlock(readStyles)(state, dispatch, view),
  });
}

/** What Insert > Building blocks > Code blocks needs of the document. */
export type CodeBlockDeps = {
  view: EditorView | null;
  canEdit: boolean;
  format: TextDocumentFormat;
  readStyles: () => readonly Style[];
  addStyle: (style: Style) => void;
};

/** The language's code style's id, `Code` and the language's style added first where the document lacks them. */
function codeStyleId(
  language: CodeBlockLanguage,
  { format, readStyles, addStyle }: CodeBlockDeps,
): string {
  const styles = [...readStyles()];
  if (!CodeBlocks.held(styles, null)) {
    const base = CodeBlocks.style(format, null, styles);
    addStyle(base);
    styles.push(base);
  }
  const held = CodeBlocks.held(styles, language);
  if (held) return held.id;
  const made = CodeBlocks.style(format, language, styles);
  addStyle(made);
  return made.id;
}

/** Insert > Building blocks > Code blocks' items, for whoever may edit the body; nothing for anyone else (dimmed). */
export function codeBlockActions(deps: CodeBlockDeps): OfficeActions {
  const { view, canEdit } = deps;
  if (!view || !canEdit) return {};
  const insert = (language: CodeBlockLanguage) => {
    if (view.isDestroyed) return;
    // The caret is in no writing (a picture or a table selected whole): nothing goes in.
    if (!insertCodeBlock('')(view.state)) {
      debugLog('[text-document] code block refused', { language });
      return;
    }
    // A step of its own: the writing before it and after it undo apart.
    startUndoStep(view);
    insertCodeBlock(codeStyleId(language, deps))(view.state, view.dispatch);
    startUndoStep(view);
    track('Element', 'Added', 'TextDocumentCodeBlock');
    debugLog('[text-document] code block', { language });
    view.focus();
  };
  return Object.fromEntries(
    CODE_BLOCK_ITEMS.map(({ language, item }) => [item, { run: () => insert(language) }]),
  );
}
