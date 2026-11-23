// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Equations in the editor": a press on an equation, or the arrow keys moving
// into it, puts the caret inside its box; the keys type, move and remove inside it; Escape, a press elsewhere or the
// arrows past either end leave it; Backspace in an empty equation removes it; nothing is written where no one edits.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { MathRow } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { equationBoxOf, equationBoxPlugin } from './text-document-equation-box';
import { equationView } from './text-document-equations';

const FRACTION: MathRow = [
  {
    kind: 'fraction',
    numerator: [{ kind: 'identifier', text: 'a' }],
    denominator: [{ kind: 'identifier', text: 'b' }],
  },
];

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** "x", an equation, "y": the equation at 2, the caret at `at`. */
function mount(math: MathRow = FRACTION, at = 2, editable = true): EditorView {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [
      schema.text('x'),
      schema.nodes.equation!.create({ math }),
      schema.text('y'),
    ]),
  ]);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, at),
    plugins: [equationBoxPlugin()],
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state,
    editable: () => editable,
    nodeViews: { equation: equationView },
  });
  return view;
}

const press = (v: EditorView, key: string) =>
  v.someProp('handleKeyDown', (f) => f(v, new KeyboardEvent('keydown', { key })));
const mathOf = (v: EditorView) => v.state.doc.nodeAt(2)?.attrs.math as MathRow | undefined;

describe('the equation box', () => {
  it('is entered by Right from the text before it, the caret at its start', () => {
    const v = mount();
    expect(press(v, 'ArrowRight')).toBe(true);
    expect(equationBoxOf(v.state)).toEqual({ pos: 2, caret: { path: [], offset: 0 } });
  });

  it('is entered by Left from the text after it, the caret at its end', () => {
    const v = mount(FRACTION, 3);
    press(v, 'ArrowLeft');
    expect(equationBoxOf(v.state)).toEqual({ pos: 2, caret: { path: [], offset: 1 } });
  });

  it('types into the equation and frames it with its caret drawn', () => {
    const v = mount([], 2);
    press(v, 'ArrowRight');
    for (const key of ['x', '^', '2']) press(v, key);
    expect(mathOf(v)).toEqual([
      {
        kind: 'scripts',
        base: [{ kind: 'identifier', text: 'x' }],
        sup: [{ kind: 'number', text: '2' }],
      },
    ]);
    const dom = v.dom.querySelector<HTMLElement>('.text-document-equation')!;
    expect(dom.dataset.editing).toBe('true');
    expect(dom.querySelector('.text-document-equation-caret')).not.toBeNull();
    expect(dom.querySelector('mrow[data-row="0.1"]')).not.toBeNull();
  });

  it('leaves by Escape, the caret after the equation, its frame gone', () => {
    const v = mount();
    press(v, 'ArrowRight');
    press(v, 'Escape');
    expect(equationBoxOf(v.state)).toBeNull();
    expect(v.state.selection.from).toBe(3);
    expect(
      v.dom.querySelector<HTMLElement>('.text-document-equation')!.dataset.editing,
    ).toBeUndefined();
  });

  it('leaves by Right past its end and Left past its start', () => {
    const v = mount();
    press(v, 'ArrowRight');
    press(v, 'ArrowLeft');
    expect(equationBoxOf(v.state)).toBeNull();
    expect(v.state.selection.from).toBe(2);
    press(v, 'ArrowRight');
    for (let i = 0; i < 6; i += 1) press(v, 'ArrowRight');
    expect(equationBoxOf(v.state)).toBeNull();
    expect(v.state.selection.from).toBe(3);
  });

  it('is left when the selection moves elsewhere', () => {
    const v = mount();
    press(v, 'ArrowRight');
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 1)));
    expect(equationBoxOf(v.state)).toBeNull();
  });

  it('removes an empty equation on Backspace', () => {
    const v = mount([], 2);
    press(v, 'ArrowRight');
    press(v, 'Backspace');
    expect(v.state.doc.textContent).toBe('xy');
    expect(equationBoxOf(v.state)).toBeNull();
  });

  it('is entered by a press on the equation, the caret at its end', () => {
    const v = mount();
    const node = v.state.doc.nodeAt(2)!;
    v.someProp('handleClickOn', (f) => f(v, 2, node, 2, new MouseEvent('mousedown'), true));
    expect(equationBoxOf(v.state)).toEqual({ pos: 2, caret: { path: [], offset: 1 } });
  });

  it('is never entered where no one may edit', () => {
    const v = mount(FRACTION, 2, false);
    expect(press(v, 'ArrowRight')).toBeFalsy();
    expect(equationBoxOf(v.state)).toBeNull();
  });

  it('leaves keys with a modifier to the editor', () => {
    const v = mount();
    press(v, 'ArrowRight');
    expect(
      v.someProp('handleKeyDown', (f) =>
        f(v, new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })),
      ),
    ).toBeFalsy();
  });
});
