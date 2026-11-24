// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Code blocks": a selection's paragraphs become one block joined by line
// breaks; an empty paragraph at the caret becomes the block; elsewhere an empty block goes in as a table does; Enter
// starts a line keeping its indent, and on an empty last line leaves the block; the styles are added where missing;
// one undo step for an Editor, counted.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { CodeBlocks, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  CODE_BLOCK_ITEMS,
  TOKEN_LANGUAGES,
  codeBlockActions,
  codeBlockOf,
  enterInCodeBlock,
  insertCodeBlock,
} from './text-document-code-blocks';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const PYTHON = CodeBlocks.style('ooxml', 'python', []);
const STYLES: Style[] = [CodeBlocks.style('ooxml', null, []), PYTHON];

const p = (text: string, style: string | null = null) =>
  schema.nodes.paragraph!.create({ style }, text ? [schema.text(text)] : []);
const doc = (...nodes: PmNode[]) => schema.node('doc', null, nodes);

function stateAt(root: PmNode, from: number, to = from) {
  return EditorState.create({ doc: root, selection: TextSelection.create(root, from, to) });
}

function run(command: ReturnType<typeof insertCodeBlock>, state: EditorState): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

const shape = (state: EditorState) =>
  state.doc.content.content.map((n) => [n.attrs.style ?? null, n.textContent]);

describe('CODE_BLOCK_ITEMS', () => {
  it('has an item per language, each with a tokenizer language', () => {
    expect(CODE_BLOCK_ITEMS).toHaveLength(18);
    expect(CODE_BLOCK_ITEMS[0]).toEqual({ language: 'c', item: 'code-block-c', label: 'C/C++' });
    expect(TOKEN_LANGUAGES.shell).toBe('bash');
    expect(TOKEN_LANGUAGES.typescript).toBe('ts');
  });
});

describe('insertCodeBlock', () => {
  it('joins a selection’s paragraphs into one block by line breaks', () => {
    const next = run(
      insertCodeBlock('CodePython'),
      stateAt(doc(p('a = 1'), p('b = 2'), p('c')), 2, 10),
    );
    expect(shape(next)).toEqual([
      ['CodePython', 'a = 1\nb = 2'],
      [null, 'c'],
    ]);
    expect(next.selection.$from.parentOffset).toBe('a = 1\nb = 2'.length);
  });

  it('makes an empty paragraph at the caret the block', () => {
    const next = run(insertCodeBlock('CodePython'), stateAt(doc(p('x'), p('')), 4));
    expect(shape(next)).toEqual([
      [null, 'x'],
      ['CodePython', ''],
    ]);
  });

  it('puts an empty block in at a caret in writing, as a table goes in', () => {
    const next = run(insertCodeBlock('CodePython'), stateAt(doc(p('abcd')), 3));
    expect(shape(next)).toEqual([
      [null, 'ab'],
      ['CodePython', ''],
      [null, 'cd'],
    ]);
    expect(next.selection.$from.parent.attrs.style).toBe('CodePython');
  });

  it('takes a block out of a list', () => {
    const listed = schema.nodes.paragraph!.create({ list: { id: 'l', level: 0 } });
    const next = run(insertCodeBlock('CodePython'), stateAt(doc(listed), 1));
    expect(next.doc.child(0).attrs.list).toBeNull();
  });
});

describe('enterInCodeBlock', () => {
  const enter = enterInCodeBlock(() => STYLES);

  it('starts a new line in the block, keeping the line’s indent', () => {
    const next = run(enter, stateAt(doc(p('def f():\n\tx = 1', 'CodePython')), 16));
    expect(shape(next)).toEqual([['CodePython', 'def f():\n\tx = 1\n\t']]);
  });

  it('leaves the block on an empty last line, for a Normal text paragraph', () => {
    const next = run(enter, stateAt(doc(p('x = 1\n', 'CodePython')), 7));
    expect(shape(next)).toEqual([
      ['CodePython', 'x = 1'],
      [null, ''],
    ]);
    expect(next.selection.$from.parent).toBe(next.doc.child(1));
  });

  it('leaves the block on a last line of nothing but its indent', () => {
    const next = run(enter, stateAt(doc(p('if x:\n    ', 'CodePython')), 11));
    expect(shape(next)).toEqual([
      ['CodePython', 'if x:'],
      [null, ''],
    ]);
  });

  it('is no code block’s Enter elsewhere', () => {
    expect(enter(stateAt(doc(p('abc')), 2))).toBe(false);
  });

  it('knows a code paragraph by its style', () => {
    expect(codeBlockOf(p('', 'CodePython'), STYLES)).toEqual({ language: 'python' });
    expect(codeBlockOf(p(''), STYLES)).toBeUndefined();
  });
});

describe('codeBlockActions', () => {
  it('adds `Code` and the language’s style where missing, puts the block in and counts it', () => {
    const view = new EditorView(document.createElement('div'), { state: stateAt(doc(p('ab')), 3) });
    const styles: Style[] = [];
    const addStyle = vi.fn((style: Style) => styles.push(style));
    const actions = codeBlockActions({
      view,
      canEdit: true,
      format: 'ooxml',
      readStyles: () => styles,
      addStyle,
    });
    actions['code-block-python']!.run();
    expect(addStyle.mock.calls.map(([s]) => s.name)).toEqual(['Code', 'Code (Python)']);
    expect(view.state.doc.child(1).attrs.style).toBe('CodePython');
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentCodeBlock');
    // The document's own styles are used once it has them.
    actions['code-block-python']!.run();
    expect(addStyle).toHaveBeenCalledTimes(2);
    view.destroy();
  });

  it('is nothing for anyone who may not edit', () => {
    expect(
      codeBlockActions({
        view: null,
        canEdit: true,
        format: 'odf',
        readStyles: () => [],
        addStyle: () => {},
      }),
    ).toEqual({});
  });
});
