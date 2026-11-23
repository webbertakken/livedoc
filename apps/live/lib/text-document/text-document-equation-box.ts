// Writing an equation in its box (docs/specs/034-text-documents/objects.md "Equations in the editor"): a press on an
// equation, or the arrow keys moving into one, puts the caret inside it; the keys then type, move and remove inside
// it, each a step of `EquationEditing`, until Escape, a press elsewhere or the arrows leave it.
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { EQUATION, EquationEditing, type MathCaret, type MathEdit } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { equationMath, type EquationBoxSpec } from './text-document-equations';

/** The equation being written, by its position, and the caret in it; none while no equation is being written. */
export type EquationBox = { readonly pos: number; readonly caret: MathCaret } | null;

export const equationBoxKey = new PluginKey<EquationBox>('text-document-equation-box');

/** The equation being written in this state, if any. */
export const equationBoxOf = (state: EditorState): EquationBox =>
  equationBoxKey.getState(state) ?? null;

const isEquationAt = (state: EditorState, pos: number) =>
  state.doc.nodeAt(pos)?.type.name === EQUATION;

/** Puts the caret in the equation at `pos`, the equation selected whole underneath. */
export function enterEquation(tr: Transaction, pos: number, caret: MathCaret): Transaction {
  return tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(equationBoxKey, { pos, caret });
}

/** Leaves the box, the caret in the text before or after the equation. */
function leave(view: EditorView, pos: number, side: 'before' | 'after'): void {
  const at = side === 'before' ? pos : pos + 1;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, at))
      .setMeta(equationBoxKey, null),
  );
  debugLog('[text-document] equation left', { side });
}

/** Writes the equation's next maths and caret, its maths only when the step changed them; 'remove' takes it out. */
export function writeEquation(
  view: EditorView,
  pos: number,
  from: MathEdit,
  next: MathEdit | 'remove' | undefined,
): void {
  if (!next) return;
  const { state } = view;
  if (next === 'remove') {
    const tr = state.tr.delete(pos, pos + 1).setMeta(equationBoxKey, null);
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos)));
    debugLog('[text-document] equation removed');
    return;
  }
  const node = state.doc.nodeAt(pos)!;
  const tr = state.tr;
  if (next.math !== from.math) tr.setNodeMarkup(pos, undefined, { ...node.attrs, math: next.math });
  view.dispatch(enterEquation(tr, pos, next.caret));
}

/** The keys inside the box; false for one it leaves to the editor. */
function boxKey(view: EditorView, box: NonNullable<EquationBox>, event: KeyboardEvent): boolean {
  const node = view.state.doc.nodeAt(box.pos);
  if (!node || node.type.name !== EQUATION) return false;
  const edit: MathEdit = { math: equationMath(node.attrs.math), caret: box.caret };
  switch (event.key) {
    case 'Escape':
      leave(view, box.pos, 'after');
      return true;
    case 'ArrowRight': {
      const caret = EquationEditing.right(edit.math, edit.caret);
      if (caret === 'after') leave(view, box.pos, 'after');
      else writeEquation(view, box.pos, edit, { ...edit, caret });
      return true;
    }
    case 'ArrowLeft': {
      const caret = EquationEditing.left(edit.math, edit.caret);
      if (caret === 'before') leave(view, box.pos, 'before');
      else writeEquation(view, box.pos, edit, { ...edit, caret });
      return true;
    }
    case 'ArrowUp':
    case 'ArrowDown':
      writeEquation(view, box.pos, edit, {
        ...edit,
        caret: EquationEditing.vertical(
          edit.math,
          edit.caret,
          event.key === 'ArrowUp' ? 'up' : 'down',
        ),
      });
      return true;
    case 'Backspace':
      writeEquation(view, box.pos, edit, EquationEditing.backspace(edit));
      return true;
    case 'Delete':
      writeEquation(view, box.pos, edit, EquationEditing.delete(edit));
      return true;
    default:
      break;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || [...event.key].length !== 1) return false;
  writeEquation(view, box.pos, edit, EquationEditing.type(edit, event.key));
  return true;
}

/** The arrow keys from the text into an equation beside the caret. */
function enterKey(view: EditorView, event: KeyboardEvent): boolean {
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const $caret = selection.$from;
  if (event.key === 'ArrowRight' && $caret.nodeAfter?.type.name === EQUATION) {
    view.dispatch(enterEquation(view.state.tr, $caret.pos, EquationEditing.start()));
    debugLog('[text-document] equation entered', { by: 'key' });
    return true;
  }
  if (event.key === 'ArrowLeft' && $caret.nodeBefore?.type.name === EQUATION) {
    const pos = $caret.pos - 1;
    const math = equationMath($caret.nodeBefore.attrs.math);
    view.dispatch(enterEquation(view.state.tr, pos, EquationEditing.end(math)));
    debugLog('[text-document] equation entered', { by: 'key' });
    return true;
  }
  return false;
}

/** The box: entered by a press or the arrows, its keys handled before every keymap, its caret drawn by the node view. */
export function equationBoxPlugin(): Plugin<EquationBox> {
  return new Plugin<EquationBox>({
    key: equationBoxKey,
    state: {
      init: () => null,
      apply: (tr, box, _old, state) => {
        const meta = tr.getMeta(equationBoxKey) as EquationBox | undefined;
        if (meta !== undefined) return meta;
        if (!box) return null;
        const pos = tr.mapping.map(box.pos);
        // Left when the equation went, or the selection moved off it (a press elsewhere, an undo).
        const { selection } = state;
        if (
          !isEquationAt(state, pos) ||
          !(selection instanceof NodeSelection) ||
          selection.from !== pos
        )
          return null;
        const math = equationMath(state.doc.nodeAt(pos)!.attrs.math);
        return { pos, caret: EquationEditing.within(math, box.caret) };
      },
    },
    props: {
      handleKeyDown: (view, event) => {
        if (!view.editable) return false;
        const box = equationBoxOf(view.state);
        return box ? boxKey(view, box, event) : enterKey(view, event);
      },
      handleClickOn: (view, _pos, node, pos, _event, direct) => {
        if (!view.editable || !direct || node.type.name !== EQUATION) return false;
        const math = equationMath(node.attrs.math);
        view.dispatch(enterEquation(view.state.tr, pos, EquationEditing.end(math)));
        debugLog('[text-document] equation entered', { by: 'press' });
        return true;
      },
      decorations: (state) => {
        const box = equationBoxOf(state);
        if (!box) return null;
        const spec: EquationBoxSpec = { equationCaret: box.caret };
        return DecorationSet.create(state.doc, [Decoration.node(box.pos, box.pos + 1, {}, spec)]);
      },
    },
  });
}
