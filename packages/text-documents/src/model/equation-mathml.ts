// An equation's maths as MathML Core (docs/specs/034-text-documents/objects.md "Equations in the formats", written;
// "Equations in the editor"): one tree, which the ODF writer writes as text and the editor builds as elements, so the
// file and the screen draw the same maths.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import { FENCE_CLOSERS, FENCE_OPENERS, INTEGRALS, type MathNode, type MathRow } from './equations';

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** A MathML element: its local name, its attributes, its children (elements, or text). */
export type MathMlElement = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly (MathMlElement | string)[];
};

const el = (
  name: string,
  children: readonly (MathMlElement | string)[],
  attrs: Readonly<Record<string, string>> = {},
): MathMlElement => ({ name, attrs, children });
const mo = (text: string, attrs: Readonly<Record<string, string>> = {}) => el('mo', [text], attrs);

/** A row in its own `mrow`; brackets at its ends that are tokens say so, so it never reads back as a fence. */
function rowTree(row: MathRow): MathMlElement {
  const edge = (node: MathNode | undefined, set: ReadonlySet<string>) =>
    node?.kind === 'operator' && set.has(node.text);
  if (row.length < 2 || !edge(row[0], FENCE_OPENERS) || !edge(row[row.length - 1], FENCE_CLOSERS))
    return el('mrow', row.map(nodeTree));
  const plain = (node: MathNode) => mo((node as { text: string }).text, { fence: 'false' });
  return el('mrow', [
    plain(row[0]!),
    ...row.slice(1, -1).map(nodeTree),
    plain(row[row.length - 1]!),
  ]);
}

function nodeTree(node: MathNode): MathMlElement {
  switch (node.kind) {
    case 'identifier':
      return el('mi', [node.text]);
    case 'number':
      return el('mn', [node.text]);
    case 'operator':
      return mo(node.text);
    case 'text':
      return el('mtext', [node.text]);
    case 'fraction':
      return el('mfrac', [rowTree(node.numerator), rowTree(node.denominator)]);
    case 'scripts': {
      const name = node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup';
      const scripts = [node.sub, node.sup].filter((r): r is MathRow => r !== undefined);
      return el(name, [rowTree(node.base), ...scripts.map(rowTree)]);
    }
    case 'root':
      return node.index
        ? el('mroot', [rowTree(node.radicand), rowTree(node.index)])
        : el('msqrt', node.radicand.map(nodeTree));
    case 'large-operator': {
      const [both, low, up] = INTEGRALS.has(node.operator)
        ? ['msubsup', 'msub', 'msup']
        : ['munderover', 'munder', 'mover'];
      const sign = mo(node.operator);
      const lower = node.lower.length > 0;
      const upper = node.upper.length > 0;
      const limits =
        lower && upper
          ? el(both, [sign, rowTree(node.lower), rowTree(node.upper)])
          : lower
            ? el(low, [sign, rowTree(node.lower)])
            : upper
              ? el(up, [sign, rowTree(node.upper)])
              : // No limit: an empty pair of them, so the sign still reads back as a large operator.
                el(both, [sign, rowTree([]), rowTree([])]);
      return el('mrow', [limits, rowTree(node.body)]);
    }
    case 'fence': {
      const side = (text: string) => mo(text, { fence: 'true', stretchy: 'true' });
      return el('mrow', [side(node.open), ...node.body.map(nodeTree), side(node.close)]);
    }
    case 'accent':
      return el('mover', [rowTree(node.base), mo(node.accent)], { accent: 'true' });
    case 'under-over': {
      const name = node.under && node.over ? 'munderover' : node.under ? 'munder' : 'mover';
      const parts = [node.under, node.over].filter((r): r is MathRow => r !== undefined);
      return el(name, [rowTree(node.base), ...parts.map(rowTree)]);
    }
  }
}

/** An equation's maths as its `math` element, its row in one `mrow`: LibreOffice misreads a `math` of several children. */
export const mathMlTree = (row: MathRow): MathMlElement => el('math', [rowTree(row)]);

function serialise(e: MathMlElement): string {
  const attrs = Object.entries(e.attrs)
    .map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`)
    .join('');
  const inner = e.children
    .map((c) => (typeof c === 'string' ? escapeXmlText(c) : serialise(c)))
    .join('');
  return `<${e.name}${attrs}>${inner}</${e.name}>`;
}

/** An equation's maths as a `math` element in the MathML namespace, declaring it itself. */
export const mathMlXml = (row: MathRow): string =>
  serialise(mathMlTree(row)).replace(/^<math>/, `<math xmlns="${MATHML_NS}">`);
