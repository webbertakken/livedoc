// An equation's maths as MathML Core (docs/specs/034-text-documents/objects.md "Equations in the formats", written;
// "Equations in the editor"): one tree, which the ODF writer writes as text and the editor builds as elements, so the
// file and the screen draw the same maths. Marked for the editor, every row is its own `mrow` naming its place.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import {
  childRowKeys,
  FENCE_CLOSERS,
  FENCE_OPENERS,
  INTEGRALS,
  mathRowId,
  type MathNode,
  type MathRow,
  type MathStep,
} from './equations';

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

/** Where a row stands, when the tree is marked for the editor's caret; none when it is written to a file. */
type Mark = readonly MathStep[] | undefined;

/** A row in its own `mrow`; brackets at its ends that are tokens say so, so it never reads back as a fence. */
function rowTree(row: MathRow, mark: Mark): MathMlElement {
  const attrs = mark
    ? { 'data-row': mathRowId(mark), ...(row.length === 0 ? { 'data-empty': 'true' } : {}) }
    : {};
  const nodes = (from: number, to: number) =>
    row.slice(from, to).map((n, i) => nodeTree(n, mark, from + i));
  const edge = (node: MathNode | undefined, set: ReadonlySet<string>) =>
    node?.kind === 'operator' && set.has(node.text);
  if (row.length < 2 || !edge(row[0], FENCE_OPENERS) || !edge(row[row.length - 1], FENCE_CLOSERS))
    return el('mrow', nodes(0, row.length), attrs);
  const plain = (node: MathNode) => mo((node as { text: string }).text, { fence: 'false' });
  return el(
    'mrow',
    [plain(row[0]!), ...nodes(1, row.length - 1), plain(row[row.length - 1]!)],
    attrs,
  );
}

function nodeTree(node: MathNode, mark: Mark, at: number): MathMlElement {
  const keys = childRowKeys(node);
  /** One of the node's rows, by name, in its own `mrow`. */
  const row = (key: string) =>
    rowTree(
      (node as unknown as Record<string, MathRow>)[key]!,
      mark && [...mark, { node: at, row: keys.indexOf(key) }],
    );
  /** A row whose nodes sit in their parent unwrapped in a file (a square root's, a fence's), wrapped when marked. */
  const inline = (key: string, nodes: MathRow) =>
    mark ? [row(key)] : nodes.map((n, i) => nodeTree(n, undefined, i));
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
      return el('mfrac', [row('numerator'), row('denominator')]);
    case 'scripts': {
      const name = node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup';
      return el(name, [row('base'), ...keys.filter((k) => k !== 'base').map(row)]);
    }
    case 'root':
      return node.index
        ? el('mroot', [row('radicand'), row('index')])
        : el('msqrt', inline('radicand', node.radicand));
    case 'large-operator': {
      const [both, low, up] = INTEGRALS.has(node.operator)
        ? ['msubsup', 'msub', 'msup']
        : ['munderover', 'munder', 'mover'];
      const sign = mo(node.operator);
      // Marked, both limits are drawn, an empty one as its empty row, so the caret can stand in it.
      const lower = node.lower.length > 0 || mark !== undefined;
      const upper = node.upper.length > 0 || mark !== undefined;
      const limits =
        lower && upper
          ? el(both, [sign, row('lower'), row('upper')])
          : lower
            ? el(low, [sign, row('lower')])
            : upper
              ? el(up, [sign, row('upper')])
              : // No limit: an empty pair of them, so the sign still reads back as a large operator.
                el(both, [sign, rowTree([], undefined), rowTree([], undefined)]);
      return el('mrow', [limits, row('body')]);
    }
    case 'fence': {
      const side = (text: string) => mo(text, { fence: 'true', stretchy: 'true' });
      return el('mrow', [side(node.open), ...inline('body', node.body), side(node.close)]);
    }
    case 'accent':
      return el('mover', [row('base'), mo(node.accent)], { accent: 'true' });
    case 'under-over': {
      const name = node.under && node.over ? 'munderover' : node.under ? 'munder' : 'mover';
      return el(name, [row('base'), ...keys.filter((k) => k !== 'base').map(row)]);
    }
  }
}

/**
 * An equation's maths as its `math` element, its row in one `mrow` (LibreOffice misreads a `math` of several
 * children). `marked`: each row an `mrow` naming its place (`data-row`), an empty one saying so, for the editor.
 */
export const mathMlTree = (row: MathRow, marked = false): MathMlElement =>
  el('math', [rowTree(row, marked ? [] : undefined)]);

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
