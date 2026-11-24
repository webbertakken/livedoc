// Code blocks drawn (docs/specs/034-text-documents/objects.md "Code blocks"): each code paragraph marked as a block
// with its language's name, and its keywords, strings, comments and numbers coloured for the paper, by the editor only.
// The tokenizer is loaded on the first block; until it lands, blocks are drawn without colours.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { CODE_BLOCK_LANGUAGES, type Style } from '@livedoc/text-documents';
import type { CodeTokenKind } from '@/lib/code-tokens';
import { codeRangesLoaded, loadCodeTokenizer } from '@/lib/code-highlight-registry';
import { debugLog } from '@/lib/debug-log';
import { codeBlockOf, TOKEN_LANGUAGES } from './text-document-code-blocks';
import { paperInk } from './text-document-paper';

export const CODE_BLOCK_CLASS = 'text-document-code-block';

/** Each token's colour, as Google's code blocks colour them (default), drawn for the paper. */
export const CODE_TOKEN_COLOURS: Readonly<Record<Exclude<CodeTokenKind, 'plain'>, string>> = {
  keyword: '#1967d2',
  string: '#188038',
  comment: '#d01884',
  number: '#b06000',
};

const TOKEN_ATTRS = Object.fromEntries(
  Object.entries(CODE_TOKEN_COLOURS).map(([kind, colour]) => [
    kind,
    { class: `text-document-code-${kind}`, style: `color: ${paperInk(colour)}` },
  ]),
) as Record<Exclude<CodeTokenKind, 'plain'>, { class: string; style: string }>;

const LABELS = new Map<string, string>(CODE_BLOCK_LANGUAGES.map((l) => [l.id, l.label]));

/** Where the tokenizer is, so a test can stand one in. */
export type CodeTokenizer = {
  ranges: typeof codeRangesLoaded;
  load: () => Promise<void>;
};

// The blocks' tokens by language and text: a keystroke retokenizes only the block it lands in.
const CACHE_MAX = 200;
const cache = new Map<string, ReturnType<typeof codeRangesLoaded>>();
const cachedRanges: typeof codeRangesLoaded = (code, language) => {
  const id = `${language}\u0000${code}`;
  const held = cache.get(id);
  if (held) return held;
  const ranges = codeRangesLoaded(code, language);
  if (!ranges) return undefined;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(id, ranges);
  return ranges;
};

const REGISTRY: CodeTokenizer = { ranges: cachedRanges, load: loadCodeTokenizer };

const key = new PluginKey<DecorationSet>('text-document-code-highlight');

/** The code blocks' decorations, and whether any block waits for the tokenizer to be coloured. */
export function codeDecorations(
  doc: PmNode,
  styles: readonly Style[],
  tokenizer: Pick<CodeTokenizer, 'ranges'> = REGISTRY,
): { decorations: DecorationSet; waiting: boolean } {
  const decorations: Decoration[] = [];
  let waiting = false;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const block = codeBlockOf(node, styles);
    if (!block) return false;
    const label = block.language ? LABELS.get(block.language) : undefined;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: CODE_BLOCK_CLASS,
        ...(label ? { 'data-code-language': label } : {}),
      }),
    );
    if (!block.language) return false;
    // One character for each atom, so offsets are positions.
    const text = node.textBetween(0, node.content.size, undefined, '\ufffc');
    const ranges = tokenizer.ranges(text, TOKEN_LANGUAGES[block.language]);
    if (!ranges) waiting = true;
    for (const { from, to, kind } of ranges ?? [])
      decorations.push(Decoration.inline(pos + 1 + from, pos + 1 + to, TOKEN_ATTRS[kind]));
    return false;
  });
  return { decorations: DecorationSet.create(doc, decorations), waiting };
}

/** Draws the code blocks; `readStyles` reads the document's styles as each change lands. */
export function codeHighlightPlugin({
  readStyles,
  tokenizer = REGISTRY,
}: {
  readStyles: () => readonly Style[];
  tokenizer?: CodeTokenizer;
}): Plugin<DecorationSet> {
  let view: EditorView | null = null;
  // Whether the tokenizer was asked for since the writing last changed: a failed load is tried again on the next
  // change, never in a loop of redraws.
  let asked = false;
  const draw = (state: EditorState | { doc: PmNode }) => {
    const { decorations, waiting } = codeDecorations(state.doc, readStyles(), tokenizer);
    if (waiting && !asked) {
      asked = true;
      void tokenizer.load().then(() => {
        const live = view && !view.isDestroyed ? view : null;
        debugLog('[text-document] code tokenizer settled', { redraw: live !== null });
        live?.dispatch(live.state.tr.setMeta(key, 'loaded'));
      });
    }
    return decorations;
  };
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => draw(state),
      apply: (tr, old, _, state) => {
        if (tr.docChanged) asked = false;
        return tr.docChanged || tr.getMeta(key) ? draw(state) : old;
      },
    },
    props: { decorations: (state) => key.getState(state) },
    view: (editorView) => {
      view = editorView;
      return {
        destroy: () => {
          view = null;
        },
      };
    },
  });
}
