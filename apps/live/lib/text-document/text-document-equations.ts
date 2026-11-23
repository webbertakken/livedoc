// An equation in the editor (docs/specs/034-text-documents/objects.md "Equations in the editor"): one character to
// the caret, drawn as MathML in the browser's own maths layout, from the same tree the ODF writer writes.
import type { NodeSpec } from 'prosemirror-model';
import {
  EQUATION_ATTRIBUTES,
  Equations,
  MATHML_NS,
  mathMlTree,
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
export const mathElement = (math: MathRow, doc: Document = document): Element =>
  build(mathMlTree(math), doc);

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
