// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Footnotes": Insert > Footnote makes a note, one empty paragraph at
// 10 pt (ODF's paragraph text formatting; OOXML's first characters typed), and puts its mark at the caret, a selection
// ended there, in the caret's formatting, as one step of the body's undo. Move to current / next / previous footnote
// find the mark beside, after and before the caret.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { storyFragment, TextDocumentState } from '@livedoc/text-documents';
import {
  afterMark,
  insertFootnote,
  makeNoteStory,
  markAfter,
  markBefore,
  markBeside,
  marksIn,
  noteStartMarks,
} from './text-document-footnotes-edit';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;

const body = () => view.state.doc;
const caret = (pos: number) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(body(), pos)));
// The body's first paragraph with each mark as [n], numbered by order.
const said = () => {
  let n = 0;
  let out = '';
  body().firstChild!.forEach((node) => {
    out += node.isText ? node.text : `[${(n += 1)}]`;
  });
  return out;
};

beforeEach(async () => {
  doc = TextDocumentState.load();
  const fragment = TextDocumentState.body(doc);
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText('Hello world')]);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, [p]);
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(fragment), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => view.destroy());

describe('makeNoteStory', () => {
  it('makes one empty paragraph at 10 pt in ODF, and none of its own in OOXML', () => {
    const odf = storyFragment(doc, makeNoteStory(doc, 'odf')).toArray() as Y.XmlElement[];
    expect(odf).toHaveLength(1);
    expect(odf[0]!.nodeName).toBe('paragraph');
    expect(odf[0]!.length).toBe(0);
    expect(odf[0]!.getAttribute('text')).toEqual({ size: 10 });
    const ooxml = storyFragment(doc, makeNoteStory(doc, 'ooxml')).toArray() as Y.XmlElement[];
    expect(ooxml[0]!.getAttribute('text')).toBeUndefined();
  });

  it('names each note anew', () => {
    expect(makeNoteStory(doc, 'odf')).not.toBe(makeNoteStory(doc, 'odf'));
  });
});

describe('insertFootnote', () => {
  it('puts the mark at the caret, the caret after it, naming a new note', () => {
    caret(6);
    const story = insertFootnote(view, doc, 'odf');
    expect(story).toEqual(expect.any(String));
    expect(said()).toBe('Hello[1] world');
    expect(marksIn(body())).toEqual([{ pos: 6, story }]);
    expect(view.state.selection.head).toBe(7);
    expect(storyFragment(doc, story!).length).toBe(1);
  });

  it('ends a selection at its end, the selected text kept', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(body(), 1, 6)));
    insertFootnote(view, doc, 'odf');
    expect(said()).toBe('Hello[1] world');
  });

  it('takes the caret’s text formatting', () => {
    caret(3);
    view.dispatch(view.state.tr.setStoredMarks([schema.marks.bold!.create({ value: true })]));
    insertFootnote(view, doc, 'odf');
    expect(marksIn(body())).toHaveLength(1);
    expect(body().firstChild!.child(1).attrs.props).toEqual({ bold: true });
  });

  it('is one step of the body’s undo', () => {
    caret(6);
    insertFootnote(view, doc, 'odf');
    yUndoPluginKey.getState(view.state)!.undoManager.undo();
    expect(said()).toBe('Hello world');
  });

  it('puts none where no text stands', () => {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(body(), 0)));
    expect(insertFootnote(view, doc, 'odf')).toBeNull();
    expect(said()).toBe('Hello world');
  });
});

describe('the marks around the caret', () => {
  let first: string;
  let second: string;
  beforeEach(() => {
    caret(3);
    first = insertFootnote(view, doc, 'odf')!;
    caret(9);
    second = insertFootnote(view, doc, 'odf')!;
    // "He[1]llo w[2]orld": marks at 3 and 9.
  });

  it('finds the mark just before or after the caret, or selected', () => {
    caret(4);
    expect(markBeside(view.state)).toEqual({ pos: 3, story: first });
    caret(9);
    expect(markBeside(view.state)).toEqual({ pos: 9, story: second });
    caret(6);
    expect(markBeside(view.state)).toBeNull();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(body(), 9)));
    expect(markBeside(view.state)).toEqual({ pos: 9, story: second });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(body(), 2, 5)));
    expect(markBeside(view.state)).toBeNull();
  });

  it('finds the next mark from the caret, never the one just passed', () => {
    caret(1);
    expect(markAfter(view.state)?.story).toBe(first);
    caret(4);
    expect(markAfter(view.state)?.story).toBe(second);
    caret(10);
    expect(markAfter(view.state)).toBeNull();
  });

  it('finds the previous mark from the caret, never the one just passed', () => {
    caret(12);
    expect(markBefore(view.state)?.story).toBe(second);
    caret(10);
    expect(markBefore(view.state)?.story).toBe(first);
    caret(4);
    expect(markBefore(view.state)).toBeNull();
  });

  it('tells where the caret stands just after a note’s mark', () => {
    expect(afterMark(body(), second)).toBe(10);
    expect(afterMark(body(), 'gone')).toBeNull();
  });
});

describe('noteStartMarks', () => {
  const note = (text: string) => {
    const fragment = storyFragment(doc, 'n');
    const p = new Y.XmlElement('paragraph');
    if (text) p.insert(0, [new Y.XmlText(text)]);
    doc.transact(() => fragment.insert(0, [p]));
    return new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({ schema, plugins: [ySyncPlugin(fragment)] }),
    });
  };

  it('starts an empty OOXML note’s typing at 10 pt', async () => {
    const edited = note('');
    await new Promise((resolve) => setTimeout(resolve, 0));
    noteStartMarks(edited, 'ooxml');
    expect(edited.state.storedMarks?.map((m) => [m.type.name, Number(m.attrs.value)])).toEqual([
      ['size', 10],
    ]);
    edited.destroy();
  });

  it('leaves an ODF note and one with writing as they are', async () => {
    const edited = note('Said');
    await new Promise((resolve) => setTimeout(resolve, 0));
    noteStartMarks(edited, 'ooxml');
    noteStartMarks(edited, 'odf');
    expect(edited.state.storedMarks).toBeNull();
    edited.destroy();
  });
});
