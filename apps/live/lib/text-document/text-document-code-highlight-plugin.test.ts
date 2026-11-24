// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Code blocks": a code paragraph is drawn as a block with its language's name;
// its keywords, strings, comments and numbers are coloured by the editor only; a block of no language is not
// coloured; until the tokenizer loads, blocks are drawn without colours, then redrawn.
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { CodeBlocks, type Style } from '@livedoc/text-documents';
import { codeTokenRanges } from '@/lib/code-tokens';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  CODE_BLOCK_CLASS,
  codeDecorations,
  codeHighlightPlugin,
  type CodeTokenizer,
} from './text-document-code-highlight-plugin';

const STYLES: Style[] = [
  CodeBlocks.style('ooxml', null, []),
  CodeBlocks.style('ooxml', 'python', []),
];

const p = (text: string, style: string | null = null) =>
  schema.nodes.paragraph!.create({ style }, text ? [schema.text(text)] : []);

const loaded: CodeTokenizer = { ranges: codeTokenRanges, load: () => Promise.resolve() };

describe('codeDecorations', () => {
  it('marks a code paragraph with its language and colours its tokens', () => {
    const doc = schema.node('doc', null, [p('x'), p('def f(): # c', 'CodePython')]);
    const { decorations, waiting } = codeDecorations(doc, STYLES, loaded);
    expect(waiting).toBe(false);
    const found = decorations.find();
    // The block spans its paragraph; the rest colour its tokens.
    const end = 3 + doc.child(1).nodeSize;
    expect(found.filter((d) => d.from === 3 && d.to === end)).toHaveLength(1);
    const inline = found.filter((d) => d.from !== 3 || d.to !== end);
    expect(inline.map((d) => doc.textBetween(d.from, d.to))).toEqual(['def', '# c']);
  });

  it('draws a block of no language without colours, and other paragraphs not at all', () => {
    const doc = schema.node('doc', null, [p('if x', 'Code'), p('if y')]);
    const found = codeDecorations(doc, STYLES, loaded).decorations.find();
    expect(found).toHaveLength(1);
  });

  it('waits for the tokenizer, drawing the block meanwhile', () => {
    const doc = schema.node('doc', null, [p('def', 'CodePython')]);
    const { decorations, waiting } = codeDecorations(doc, STYLES, { ranges: () => undefined });
    expect(waiting).toBe(true);
    expect(decorations.find()).toHaveLength(1);
  });
});

describe('codeHighlightPlugin', () => {
  it('draws the block’s class and label, and colours it once the tokenizer lands', async () => {
    let ready = false;
    const load = vi.fn(() => {
      ready = true;
      return Promise.resolve();
    });
    const tokenizer: CodeTokenizer = {
      ranges: (code, language) => (ready ? codeTokenRanges(code, language) : undefined),
      load,
    };
    const doc = schema.node('doc', null, [p('return 1', 'CodePython')]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        plugins: [codeHighlightPlugin({ readStyles: () => STYLES, tokenizer })],
      }),
    });
    const block = view.dom.querySelector(`.${CODE_BLOCK_CLASS}`)!;
    expect(block.getAttribute('data-code-language')).toBe('Python');
    expect(load).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(view.dom.querySelector('.text-document-code-keyword')).not.toBeNull(),
    );
    expect(view.dom.querySelector('.text-document-code-keyword')!.textContent).toBe('return');
    view.destroy();
  });
});
