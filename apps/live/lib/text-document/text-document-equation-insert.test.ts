// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Equations in the editor": Insert > Equation puts an empty equation at the
// caret, in place of a selection, the caret in its box; counted; nothing for whoever may not edit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { equationBoxOf, equationBoxPlugin } from './text-document-equation-box';
import {
  EQUATION_ITEM,
  enterSelectedEquation,
  equationActions,
  insertEquation,
} from './text-document-equation-insert';
import { suggestTransaction } from './text-document-suggesting';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  track.mockClear();
});

function mount(from: number, to = from, suggesting = false): EditorView {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, schema.text('a = bc')),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, from, to),
      plugins: [equationBoxPlugin()],
    }),
    dispatchTransaction(this: EditorView, tr) {
      const result =
        suggesting && tr.docChanged
          ? suggestTransaction(this.state, tr, {
              key: 'k',
              name: 'Ada',
              colour: '#000',
              now: 1,
              newId: () => 's1',
            })
          : { tr };
      if ('tr' in result) this.updateState(this.state.apply(result.tr));
    },
  });
  return view;
}

describe('Insert > Equation', () => {
  it('puts an empty equation at the caret, the caret in its box', () => {
    const v = mount(5);
    expect(insertEquation(v.state, v.dispatch)).toBe(true);
    expect(equationBoxOf(v.state)).toBeNull();
    expect(enterSelectedEquation(v.state, v.dispatch)).toBe(true);
    const node = v.state.doc.nodeAt(5)!;
    expect(node.type.name).toBe('equation');
    expect(node.attrs.math).toEqual([]);
    expect(equationBoxOf(v.state)).toEqual({ pos: 5, caret: { path: [], offset: 0 } });
  });

  it('replaces a selection', () => {
    const v = mount(5, 7);
    insertEquation(v.state, v.dispatch);
    expect(v.state.doc.textContent).toBe('a = ');
    expect(v.state.doc.nodeAt(5)?.type.name).toBe('equation');
  });

  it('puts the caret in the box of an equation placed as a suggestion, where it landed', () => {
    const v = mount(5, 7, true);
    equationActions(v, true)[EQUATION_ITEM]!.run();
    // The replaced text stays, suggested deleted, and the equation follows it.
    expect(v.state.doc.nodeAt(7)?.attrs.insertion).toMatchObject({ id: 's1' });
    expect(equationBoxOf(v.state)).toEqual({ pos: 7, caret: { path: [], offset: 0 } });
  });

  it('is counted from the menu, and offered only to whoever may edit', () => {
    const v = mount(1);
    equationActions(v, true)[EQUATION_ITEM]!.run();
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentEquation');
    expect(equationActions(v, false)).toEqual({});
  });
});
