// Equations as MathML (docs/specs/034-text-documents/objects.md "Equations in the formats"): read into the model's
// rows when every element and attribute is one the model maps, else left for the frame to be kept; written back as
// MathML Core, which LibreOffice reads and the browser draws.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  Equations,
  FENCE_CLOSERS,
  FENCE_OPENERS,
  LARGE_OPERATORS,
  type MathNode,
  type MathRow,
  type MathTokenKind,
} from '../model/equations';
import { NS } from './odf-names';
import { MATHML_NS, mathMlXml } from '../model/equation-mathml';
import { odfEquationSize } from './odf-equation-size';

const TOKENS: Readonly<Record<string, MathTokenKind>> = {
  mi: 'identifier',
  mn: 'number',
  mo: 'operator',
  mtext: 'text',
  ms: 'text',
};

/** Presentation hints the model draws its own way: read past, never reason to keep. */
const IGNORED_ATTRIBUTES = new Set([
  'display',
  'stretchy',
  'fence',
  'form',
  'separator',
  'accent',
  'largeop',
  'movablelimits',
  'symmetric',
  'lspace',
  'rspace',
  'class',
  'id',
]);

/** Thrown inside the reader when the equation holds what the model does not map; caught at its top. */
class Unmapped extends Error {}

const unmapped = (): never => {
  throw new Unmapped();
};

function checkAttributes(e: XmlElement, also: readonly string[] = []): void {
  for (const a of e.attributes) {
    if (a.uri !== '' && a.uri !== MATHML_NS) unmapped();
    if (IGNORED_ATTRIBUTES.has(a.local) || also.includes(a.local)) continue;
    // A word is upright as it stands; a single letter so marked is a style the model has no place for.
    if (
      a.local === 'mathvariant' &&
      a.value === 'normal' &&
      TOKENS[e.local] &&
      textContent(e).trim().length > 1
    )
      continue;
    unmapped();
  }
}

const isMath = (e: XmlElement, local: string) => e.uri === MATHML_NS && e.local === local;
const tokenText = (e: XmlElement): string => {
  if (childElements(e).length > 0) unmapped();
  return e.local === 'mtext' || e.local === 'ms' ? textContent(e) : textContent(e).trim();
};

/** An `mo` of a large operator's character, the base of a large operator. */
const largeOperatorOf = (e: XmlElement | undefined): string | undefined => {
  if (!e || !isMath(e, 'mo')) return undefined;
  const text = textContent(e).trim();
  return LARGE_OPERATORS.has(text) ? text : undefined;
};

const SCRIPTED = new Set(['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover']);

/** The scripted element's base and its lower and upper parts, by its shape. */
function scriptParts(e: XmlElement): { base: XmlElement; lower?: XmlElement; upper?: XmlElement } {
  const children = childElements(e);
  const both = e.local === 'msubsup' || e.local === 'munderover';
  if (children.length !== (both ? 3 : 2)) unmapped();
  const [base, a, b] = children as [XmlElement, XmlElement, XmlElement | undefined];
  if (both) return { base, lower: a, upper: b };
  return e.local === 'msub' || e.local === 'munder' ? { base, lower: a } : { base, upper: a };
}

/** A child element as a row: an `mrow` its children, anything else the one node it reads as. */
function rowOfElement(e: XmlElement): MathRow {
  if (isMath(e, 'mrow') && !fenceOf(e)) {
    checkAttributes(e);
    return readRow(childElements(e));
  }
  return readRow([e]);
}

/** An `mrow` that opens and closes with fence operators, as a fence. */
function fenceOf(e: XmlElement): { open: string; close: string; inner: XmlElement[] } | undefined {
  const children = childElements(e);
  if (children.length < 2) return undefined;
  const first = children[0]!;
  const last = children[children.length - 1]!;
  if (!isMath(first, 'mo') || !isMath(last, 'mo')) return undefined;
  const open = textContent(first).trim();
  const close = textContent(last).trim();
  const fence = (mo: XmlElement) => attributeOf(mo, '', 'fence');
  const fenced = (mo: XmlElement, text: string, set: ReadonlySet<string>) =>
    fence(mo) !== 'false' && (set.has(text) || (text === '' && fence(mo) === 'true'));
  if (!fenced(first, open, FENCE_OPENERS) || !fenced(last, close, FENCE_CLOSERS)) return undefined;
  return { open, close, inner: children.slice(1, -1) };
}

function readRow(elements: readonly XmlElement[]): MathRow {
  const row: MathNode[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const e = elements[i]!;
    if (e.uri !== MATHML_NS) unmapped();
    const kind = TOKENS[e.local];
    if (kind) {
      checkAttributes(e);
      const text = tokenText(e);
      if (text.length > 0) row.push({ kind, text });
      continue;
    }
    if (e.local === 'mrow') {
      const fence = fenceOf(e);
      checkAttributes(e);
      if (fence) {
        for (const side of childElements(e).filter((_, n, all) => n === 0 || n === all.length - 1))
          checkAttributes(side);
        row.push({
          kind: 'fence',
          open: fence.open,
          close: fence.close,
          body: readRow(fence.inner),
        });
      } else row.push(...readRow(childElements(e)));
      continue;
    }
    if (SCRIPTED.has(e.local)) {
      const { base, lower, upper } = scriptParts(e);
      const operator = largeOperatorOf(base);
      if (operator) {
        checkAttributes(e);
        checkAttributes(base);
        const next = elements[i + 1];
        if (next) i += 1;
        row.push({
          kind: 'large-operator',
          operator,
          lower: lower ? rowOfElement(lower) : [],
          upper: upper ? rowOfElement(upper) : [],
          body: next ? rowOfElement(next) : [],
        });
        continue;
      }
      row.push(scriptedNode(e, base, lower, upper));
      continue;
    }
    row.push(structureNode(e));
  }
  return row;
}

function scriptedNode(
  e: XmlElement,
  base: XmlElement,
  lower?: XmlElement,
  upper?: XmlElement,
): MathNode {
  const baseRow = rowOfElement(base);
  if (e.local === 'mover' && attributeOf(e, '', 'accent') === 'true') {
    checkAttributes(e);
    if (!upper || !isMath(upper, 'mo')) return unmapped();
    checkAttributes(upper);
    return { kind: 'accent', base: baseRow, accent: tokenText(upper) || unmapped() };
  }
  checkAttributes(e, ['accentunder']);
  const first = lower ? { [e.local.startsWith('ms') ? 'sub' : 'under']: rowOfElement(lower) } : {};
  const second = upper ? { [e.local.startsWith('ms') ? 'sup' : 'over']: rowOfElement(upper) } : {};
  return e.local.startsWith('ms')
    ? { kind: 'scripts', base: baseRow, ...first, ...second }
    : { kind: 'under-over', base: baseRow, ...first, ...second };
}

function structureNode(e: XmlElement): MathNode {
  const children = childElements(e);
  switch (e.local) {
    case 'mfrac':
      checkAttributes(e);
      if (children.length !== 2) unmapped();
      return {
        kind: 'fraction',
        numerator: rowOfElement(children[0]!),
        denominator: rowOfElement(children[1]!),
      };
    case 'msqrt':
      checkAttributes(e);
      return { kind: 'root', radicand: readRow(children) };
    case 'mroot':
      checkAttributes(e);
      if (children.length !== 2) unmapped();
      return {
        kind: 'root',
        radicand: rowOfElement(children[0]!),
        index: rowOfElement(children[1]!),
      };
    case 'mfenced': {
      checkAttributes(e, ['open', 'close']);
      if (attributeOf(e, '', 'separators') !== undefined || children.length > 1) unmapped();
      return {
        kind: 'fence',
        open: attributeOf(e, '', 'open') ?? '(',
        close: attributeOf(e, '', 'close') ?? ')',
        body: readRow(children),
      };
    }
    default:
      return unmapped();
  }
}

/**
 * A `math` element's equation, or undefined when it holds what the model does not map or is past the limits (the
 * frame is then kept). `semantics` reads as its first child, its annotations left behind.
 */
export function readMathMl(math: XmlElement): MathRow | undefined {
  try {
    if (!isMath(math, 'math')) return undefined;
    checkAttributes(math, ['displaystyle', 'altimg', 'alttext', 'xmlns']);
    let children = childElements(math);
    if (children.length === 1 && isMath(children[0]!, 'semantics')) {
      const first = childElements(children[0]!)[0];
      children = first ? [first] : [];
    }
    const row = readRow(children);
    return Equations.within(row) ? row : undefined;
  } catch (error) {
    if (error instanceof Unmapped) return undefined;
    throw error;
  }
}

/** A package entry an `xlink:href` names, without its `./`; none for an outside link. */
const entryOf = (href: string | undefined): string | undefined => {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) return undefined;
  return href.replace(/^\.\//, '').replace(/\/$/, '');
};

/** An equation a frame holds, and the package entries it was read from (its formula part, its replacement image). */
export type OdfEquationRead = { readonly math: MathRow; readonly entries: readonly string[] };

/**
 * A frame in line holding a formula, as an equation: its MathML in the frame (a flat file), or in the formula part its
 * object names (`formulas`, by the part's folder). Anything else, or maths the model does not map: none, so it is kept.
 */
export function readOdfEquation(
  frame: XmlElement,
  formulas: ReadonlyMap<string, XmlElement>,
): OdfEquationRead | undefined {
  if (frame.uri !== NS.draw || frame.local !== 'frame') return undefined;
  if (attributeOf(frame, NS.text, 'anchor-type') !== 'as-char') return undefined;
  const children = childElements(frame);
  const object = children[0];
  if (!object || object.uri !== NS.draw || object.local !== 'object') return undefined;
  const replacement = children[1];
  if (
    children.length > 2 ||
    (replacement && (replacement.uri !== NS.draw || replacement.local !== 'image'))
  )
    return undefined;
  const entries: string[] = [];
  const replaced = replacement && entryOf(attributeOf(replacement, NS.xlink, 'href'));
  if (replaced) entries.push(replaced);
  const inline = childElements(object);
  if (inline.length > 0) {
    const math = inline.length === 1 ? readMathMl(inline[0]!) : undefined;
    return math ? { math, entries } : undefined;
  }
  const part = entryOf(attributeOf(object, NS.xlink, 'href'));
  const root = part === undefined ? undefined : formulas.get(part);
  const math = root && readMathMl(root);
  return math ? { math, entries: [...entries, `${part}/`] } : undefined;
}

/** An equation's frame in line, sized to hold its maths, its maths inside its object; LibreOffice gives it its style. */
export function odfEquationXml(row: MathRow, name: string): string {
  const { width, height } = odfEquationSize(row);
  return `<draw:frame draw:name="${escapeXmlAttribute(name)}" text:anchor-type="as-char" svg:width="${width}pt" svg:height="${height}pt"><draw:object>${mathMlXml(row)}</draw:object></draw:frame>`;
}
