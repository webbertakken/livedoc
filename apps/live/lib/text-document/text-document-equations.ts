// An equation in the editor (docs/specs/034-text-documents/objects.md "Equations in the editor"): one character to
// the caret, drawn as MathML in the browser's own maths layout, from the same tree the ODF writer writes.
import type { Node as PmNode, NodeSpec } from 'prosemirror-model';
import type { Decoration, NodeView } from 'prosemirror-view';
import {
  EQUATION_ATTRIBUTES,
  Equations,
  MATHML_NS,
  mathMlTree,
  mathRowId,
  type MathCaret,
  type MathMlElement,
  type MathRow,
} from '@livedoc/text-documents';
import { cssText, textDeclarations } from './text-document-style-sheet';

export const EQUATION_CLASS = 'text-document-equation';

const nullAttributes = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, { default: null }]));

/** The maths an equation's attribute holds; maths the model cannot hold draw as an empty equation. */
export const equationMath = (value: unknown): MathRow => Equations.of(value) ?? [];

/** A MathML tree as elements of this document, built node by node (never parsed from markup). */
function build(e: MathMlElement, doc: Document): Element {
  const element = doc.createElementNS(MATHML_NS, e.name);
  for (const [name, value] of Object.entries(e.attrs)) element.setAttribute(name, value);
  for (const child of e.children)
    element.append(typeof child === 'string' ? doc.createTextNode(child) : build(child, doc));
  return element;
}

/** An equation's maths as a MathML element, from the same tree the ODF writer writes. */
export const mathElement = (math: MathRow, doc: Document = document, marked = false): Element =>
  build(mathMlTree(math, marked), doc);

export const equationNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: nullAttributes(EQUATION_ATTRIBUTES),
  // Copied as text, an equation reads as its linear form (`a/b`, `x^2`, `√z`).
  leafText: (node) => Equations.linear(equationMath(node.attrs.math)),
  toDOM: (node) => {
    const { math: value, props } = node.attrs as { math: unknown; props: unknown };
    const math = equationMath(value);
    const own = props && typeof props === 'object' ? cssText(textDeclarations(props)) : '';
    return [
      'span',
      {
        class: EQUATION_CLASS,
        contenteditable: 'false',
        ...(math.length === 0 ? { 'data-empty': 'true' } : {}),
        ...(own ? { style: own } : {}),
      },
      mathElement(math),
    ];
  },
};

/** The caret an equation's box decoration gives it while it is being written. */
export type EquationBoxSpec = { readonly equationCaret: MathCaret };

const caretOf = (decorations: readonly Decoration[]): MathCaret | null => {
  for (const d of decorations) {
    const caret = (d.spec as Partial<EquationBoxSpec>).equationCaret;
    if (caret) return caret;
  }
  return null;
};

/** Where the caret stands in a drawn equation, in pixels from the equation's own box: its left edge, top and height. */
export function caretBox(
  dom: HTMLElement,
  caret: MathCaret,
): { x: number; y: number; height: number } | null {
  const row = dom.querySelector(`mrow[data-row="${mathRowId(caret.path)}"]`);
  if (!row) return null;
  const origin = dom.getBoundingClientRect();
  const nodes = [...row.children];
  const rowBox = row.getBoundingClientRect();
  const x =
    caret.offset < nodes.length
      ? nodes[caret.offset]!.getBoundingClientRect().left
      : nodes.length > 0
        ? nodes[nodes.length - 1]!.getBoundingClientRect().right
        : rowBox.left + rowBox.width / 2;
  return { x: x - origin.left, y: rowBox.top - origin.top, height: rowBox.height };
}

/**
 * An equation drawn as MathML in its formatting, each row marked with its place; while it is being written, its box
 * framed and the caret drawn where it stands (objects.md "Equations in the editor").
 */
export function equationView(
  node: PmNode,
  _view: unknown,
  _getPos: unknown,
  decorations: readonly Decoration[],
): NodeView {
  const dom = document.createElement('span');
  dom.className = EQUATION_CLASS;
  dom.contentEditable = 'false';
  const caretMark = document.createElement('span');
  caretMark.className = 'text-document-equation-caret';
  caretMark.setAttribute('aria-hidden', 'true');
  let drawn: unknown = undefined;
  const draw = (next: PmNode, caret: MathCaret | null) => {
    const { math: value, props } = next.attrs as { math: unknown; props: unknown };
    if (value !== drawn) {
      drawn = value;
      // Each row marked, an empty one drawn as its dotted box, so the caret has somewhere to stand.
      dom.replaceChildren(mathElement(equationMath(value), document, true));
    }
    const own = props && typeof props === 'object' ? cssText(textDeclarations(props)) : '';
    if (own) dom.setAttribute('style', own);
    else dom.removeAttribute('style');
    if (!caret) {
      delete dom.dataset.editing;
      caretMark.remove();
      return;
    }
    dom.dataset.editing = 'true';
    dom.append(caretMark);
    const box = caretBox(dom, caret);
    if (!box) return;
    caretMark.style.left = `${box.x}px`;
    caretMark.style.top = `${box.y}px`;
    caretMark.style.height = `${box.height}px`;
  };
  draw(node, caretOf(decorations));
  return {
    dom,
    update: (next, nextDecorations) => {
      if (next.type !== node.type) return false;
      draw(next, caretOf(nextDecorations));
      return true;
    },
    ignoreMutation: () => true,
  };
}
