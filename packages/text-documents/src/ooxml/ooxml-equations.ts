// Equations as OMML (docs/specs/034-text-documents/objects.md "Equations in the formats"): read into the model's
// rows when every element is one the model maps, else left for the equation to be kept; written back as Word writes
// them, each token its own run.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import { Equations, INTEGRALS, type MathNode, type MathRow } from '../model/equations';
import { W_NS } from './ooxml-names';

export const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

/** Thrown inside the reader when the equation holds what the model does not map; caught at its top. */
class Unmapped extends Error {}

const unmapped = (): never => {
  throw new Unmapped();
};

const isM = (e: XmlElement, local: string) => e.uri === M_NS && e.local === local;
const mVal = (e: XmlElement | undefined) => (e ? attributeOf(e, M_NS, 'val') : undefined);
/** An OMML on/off property: present and not switched off. */
const on = (e: XmlElement | undefined) =>
  e !== undefined && !['0', 'off', 'false'].includes(mVal(e) ?? '1');

/** A structure's own properties: the listed ones, read by the caller, and `m:ctrlPr`, the rest unmapped. */
function properties(
  e: XmlElement,
  name: string,
  allowed: readonly string[],
): XmlElement | undefined {
  const pr = childElement(e, M_NS, name);
  for (const c of pr ? childElements(pr) : [])
    if (!(c.uri === M_NS && (c.local === 'ctrlPr' || allowed.includes(c.local)))) unmapped();
  return pr;
}

/** The structure's children other than its properties: each must be one of the named rows, in any order. */
function parts(e: XmlElement, pr: string, rows: readonly string[]): Map<string, XmlElement> {
  const found = new Map<string, XmlElement>();
  for (const c of childElements(e)) {
    if (isM(c, pr)) continue;
    if (c.uri !== M_NS || !rows.includes(c.local) || found.has(c.local)) unmapped();
    found.set(c.local, c);
  }
  return found;
}

/** A row element (`m:e`, `m:num`, `m:sub` …) as a row; absent is empty. */
function rowOf(e: XmlElement | undefined): MathRow {
  if (!e) return [];
  return readRow(childElements(e).filter((c) => !(isM(c, 'argPr') || isM(c, 'ctrlPr'))));
}

function run(e: XmlElement): MathNode[] {
  let upright = false;
  let normal = false;
  let text = '';
  for (const c of childElements(e)) {
    if (c.uri === W_NS && c.local === 'rPr') continue;
    if (isM(c, 'rPr')) {
      for (const p of childElements(c)) {
        if (isM(p, 'sty') && mVal(p) === 'p') upright = true;
        else if (isM(p, 'sty') && mVal(p) === 'i') continue;
        else if (isM(p, 'nor')) normal = on(p);
        else if (!isM(p, 'lit')) unmapped();
      }
      continue;
    }
    if (isM(c, 't')) {
      text += textContent(c);
      continue;
    }
    unmapped();
  }
  if (normal) return text.length > 0 ? [{ kind: 'text', text }] : [];
  return Equations.tokens(text, upright);
}

function readRow(elements: readonly XmlElement[]): MathRow {
  const row: MathNode[] = [];
  for (const e of elements) {
    if (e.uri !== M_NS) unmapped();
    switch (e.local) {
      case 'r':
        row.push(...run(e));
        break;
      case 'f': {
        const fPr = properties(e, 'fPr', ['type']);
        const type = mVal(fPr && childElement(fPr, M_NS, 'type'));
        if (type !== undefined && type !== 'bar') unmapped();
        const p = parts(e, 'fPr', ['num', 'den']);
        row.push({
          kind: 'fraction',
          numerator: rowOf(p.get('num')),
          denominator: rowOf(p.get('den')),
        });
        break;
      }
      case 'sSub':
      case 'sSup':
      case 'sSubSup': {
        properties(e, `${e.local}Pr`, ['alnScr']);
        const p = parts(e, `${e.local}Pr`, ['e', 'sub', 'sup']);
        const sub = e.local === 'sSup' ? undefined : rowOf(p.get('sub'));
        const sup = e.local === 'sSub' ? undefined : rowOf(p.get('sup'));
        row.push({
          kind: 'scripts',
          base: rowOf(p.get('e')),
          ...(sub ? { sub } : {}),
          ...(sup ? { sup } : {}),
        });
        break;
      }
      case 'rad': {
        const pr = properties(e, 'radPr', ['degHide']);
        const p = parts(e, 'radPr', ['deg', 'e']);
        const hidden = on(pr && childElement(pr, M_NS, 'degHide'));
        const radicand = rowOf(p.get('e'));
        row.push(
          hidden
            ? { kind: 'root', radicand }
            : { kind: 'root', radicand, index: rowOf(p.get('deg')) },
        );
        break;
      }
      case 'nary': {
        const pr = properties(e, 'naryPr', ['chr', 'limLoc', 'grow', 'subHide', 'supHide']);
        const p = parts(e, 'naryPr', ['sub', 'sup', 'e']);
        const hidden = (name: string) => on(pr && childElement(pr, M_NS, name));
        row.push({
          kind: 'large-operator',
          operator: mVal(pr && childElement(pr, M_NS, 'chr')) || '∫',
          lower: hidden('subHide') ? [] : rowOf(p.get('sub')),
          upper: hidden('supHide') ? [] : rowOf(p.get('sup')),
          body: rowOf(p.get('e')),
        });
        break;
      }
      case 'd': {
        const pr = properties(e, 'dPr', ['begChr', 'endChr', 'grow', 'shp']);
        const bodies = childElements(e).filter((c) => !isM(c, 'dPr'));
        if (bodies.length !== 1 || !isM(bodies[0]!, 'e')) unmapped();
        const chr = (name: string, fallback: string) =>
          mVal(pr && childElement(pr, M_NS, name)) ?? fallback;
        row.push({
          kind: 'fence',
          open: chr('begChr', '('),
          close: chr('endChr', ')'),
          body: rowOf(bodies[0]),
        });
        break;
      }
      case 'acc': {
        const pr = properties(e, 'accPr', ['chr']);
        const p = parts(e, 'accPr', ['e']);
        const accent = mVal(pr && childElement(pr, M_NS, 'chr')) || '\u0302';
        row.push({ kind: 'accent', base: rowOf(p.get('e')), accent });
        break;
      }
      case 'limLow':
      case 'limUpp': {
        properties(e, `${e.local}Pr`, []);
        const p = parts(e, `${e.local}Pr`, ['e', 'lim']);
        const base = rowOf(p.get('e'));
        const lim = rowOf(p.get('lim'));
        if (e.local === 'limLow') {
          row.push({ kind: 'under-over', base, under: lim });
          break;
        }
        const inner = base.length === 1 ? base[0]! : undefined;
        // Word writes a limit both under and over as a lower limit inside an upper one.
        if (inner?.kind === 'under-over' && inner.under && !inner.over)
          row.push({ kind: 'under-over', base: inner.base, under: inner.under, over: lim });
        else row.push({ kind: 'under-over', base, over: lim });
        break;
      }
      case 'func': {
        properties(e, 'funcPr', []);
        const p = parts(e, 'funcPr', ['fName', 'e']);
        row.push(...rowOf(p.get('fName')), ...rowOf(p.get('e')));
        break;
      }
      default:
        unmapped();
    }
  }
  return row;
}

/** An `m:oMath`'s equation, or undefined when it holds what the model does not map or is past the limits. */
export function readOmml(oMath: XmlElement): MathRow | undefined {
  try {
    if (!isM(oMath, 'oMath')) return undefined;
    const row = readRow(childElements(oMath).filter((c) => !isM(c, 'ctrlPr')));
    return Equations.within(row) ? row : undefined;
  } catch (error) {
    if (error instanceof Unmapped) return undefined;
    throw error;
  }
}

/** The first run's Word formatting inside an equation, which gives the equation its size and colour. */
export function firstMathRunProps(oMath: XmlElement): XmlElement | undefined {
  for (const c of childElements(oMath)) {
    if (isM(c, 'r')) return childElement(c, W_NS, 'rPr');
    const inner = c.uri === M_NS ? firstMathRunProps(c) : undefined;
    if (inner) return inner;
  }
  return undefined;
}

const val = (name: string, value: string) => `<m:${name} m:val="${escapeXmlAttribute(value)}"/>`;

function runXml(node: Extract<MathNode, { text: string }>, rPr: string): string {
  const mrPr =
    node.kind === 'text'
      ? '<m:rPr><m:nor/></m:rPr>'
      : node.kind === 'identifier' && [...node.text].length > 1
        ? `<m:rPr>${val('sty', 'p')}</m:rPr>`
        : '';
  return `<m:r>${mrPr}${rPr}<m:t xml:space="preserve">${escapeXmlText(node.text)}</m:t></m:r>`;
}

function nodeXml(node: MathNode, rPr: string): string {
  const row = (name: string, r: MathRow) =>
    `<m:${name}>${r.map((n) => nodeXml(n, rPr)).join('')}</m:${name}>`;
  switch (node.kind) {
    case 'identifier':
    case 'number':
    case 'operator':
    case 'text':
      return runXml(node, rPr);
    case 'fraction':
      return `<m:f>${row('num', node.numerator)}${row('den', node.denominator)}</m:f>`;
    case 'scripts': {
      const name = node.sub && node.sup ? 'sSubSup' : node.sub ? 'sSub' : 'sSup';
      return `<m:${name}>${row('e', node.base)}${node.sub ? row('sub', node.sub) : ''}${node.sup ? row('sup', node.sup) : ''}</m:${name}>`;
    }
    case 'root':
      return node.index
        ? `<m:rad>${row('deg', node.index)}${row('e', node.radicand)}</m:rad>`
        : `<m:rad><m:radPr>${val('degHide', '1')}</m:radPr><m:deg/>${row('e', node.radicand)}</m:rad>`;
    case 'large-operator': {
      const loc = INTEGRALS.has(node.operator) ? 'subSup' : 'undOvr';
      const hide = (name: string, r: MathRow) => (r.length === 0 ? val(name, '1') : '');
      const pr = `<m:naryPr>${val('chr', node.operator)}${val('limLoc', loc)}${hide('subHide', node.lower)}${hide('supHide', node.upper)}</m:naryPr>`;
      return `<m:nary>${pr}${row('sub', node.lower)}${row('sup', node.upper)}${row('e', node.body)}</m:nary>`;
    }
    case 'fence':
      return `<m:d><m:dPr>${val('begChr', node.open)}${val('endChr', node.close)}</m:dPr>${row('e', node.body)}</m:d>`;
    case 'accent':
      return `<m:acc><m:accPr>${val('chr', node.accent)}</m:accPr>${row('e', node.base)}</m:acc>`;
    case 'under-over': {
      const low = node.under
        ? `<m:limLow>${row('e', node.base)}${row('lim', node.under)}</m:limLow>`
        : undefined;
      if (!node.over) return low!;
      const base = low ? `<m:e>${low}</m:e>` : row('e', node.base);
      return `<m:limUpp>${base}${row('lim', node.over)}</m:limUpp>`;
    }
  }
}

/** The bare runs and structures of an equation, inside an `m:oMath` the caller writes. */
export const ommlContentXml = (row: MathRow, rPr: string): string =>
  row.map((n) => nodeXml(n, rPr)).join('');

/** An equation as `m:oMath`, declaring the maths namespace itself; `rPr`, the Word formatting of each run. */
export const ommlXml = (row: MathRow, rPr: string): string =>
  `<m:oMath xmlns:m="${M_NS}">${ommlContentXml(row, rPr)}</m:oMath>`;
