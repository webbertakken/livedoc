// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting": a command acts on the selection the page
// shows, even before the editor has read it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { readDomSelection } from './text-document-dom-selection';

let view: EditorView;
beforeEach(() => {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [
      schema.text('hello world'),
      schema.nodes.kept_inline!.create({ name: 'Field' }),
    ]),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc }),
  });
});
afterEach(() => {
  view.destroy();
  document.getSelection()!.removeAllRanges();
});

const showSelection = (node: Node, anchor: number, focus: number) =>
  document.getSelection()!.setBaseAndExtent(node, anchor, node, focus);

describe('readDomSelection', () => {
  it('takes the selection the page shows, backwards too', () => {
    const text = view.dom.querySelector('p')!.firstChild!;
    showSelection(text, 5, 0);
    readDomSelection(view);
    expect(view.state.selection.anchor).toBe(6);
    expect(view.state.selection.head).toBe(1);
  });

  it('changes nothing when the editor already has it, or the page shows a selection elsewhere', () => {
    const before = view.state;
    showSelection(view.dom.querySelector('p')!.firstChild!, 0, 0);
    readDomSelection(view);
    expect(view.state).toBe(before);
    const outside = document.body.appendChild(document.createTextNode('outside'));
    showSelection(outside, 0, 3);
    readDomSelection(view);
    expect(view.state).toBe(before);
    document.getSelection()!.removeAllRanges();
    readDomSelection(view);
    expect(view.state).toBe(before);
  });

  it('leaves a selected node alone', () => {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 12)));
    const before = view.state;
    showSelection(view.dom.querySelector('p')!.firstChild!, 0, 2);
    readDomSelection(view);
    expect(view.state).toBe(before);
    expect(view.state.selection instanceof TextSelection).toBe(false);
  });
});

describe('readDomSelection, unreadable', () => {
  it('keeps the selection there was when the page’s cannot be read', () => {
    const before = view.state;
    view.posAtDOM = () => {
      throw new RangeError('not in the document');
    };
    showSelection(view.dom.querySelector('p')!.firstChild!, 0, 3);
    readDomSelection(view);
    expect(view.state).toBe(before);
  });
});
