// The equation toolbar's presses (docs/specs/034-text-documents/objects.md "Equations in the editor"): a symbol or
// structure written at the caret in the equation being written, else a new equation holding it put in at the caret.
import type { EditorView } from 'prosemirror-view';
import { EquationEditing, type MathNode } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { equationBoxOf, writeEquation } from './text-document-equation-box';
import { equationMath } from './text-document-equations';
import { insertEquation } from './text-document-equation-insert';
import { startUndoStep } from './text-document-undo';

/** Writes a symbol or structure from the toolbar, the writing focused again; false where nothing could be written. */
export function writeFromEquationToolbar(view: EditorView, node: MathNode): boolean {
  view.focus();
  if (!equationBoxOf(view.state) && !newEquationFromToolbar(view)) return false;
  const at = equationBoxOf(view.state);
  const equation = at && view.state.doc.nodeAt(at.pos);
  if (!at || !equation) return false;
  const edit = { math: equationMath(equation.attrs.math), caret: at.caret };
  writeEquation(view, at.pos, edit, EquationEditing.insert(edit, node));
  return true;
}

/** New equation: an empty equation at the caret, as Insert > Equation, counted the same. */
export function newEquationFromToolbar(view: EditorView): boolean {
  view.focus();
  startUndoStep(view);
  if (!insertEquation(view.state, view.dispatch)) return false;
  track('Element', 'Added', 'TextDocumentEquation');
  debugLog('[text-document] equation inserted', { from: 'toolbar' });
  return true;
}
