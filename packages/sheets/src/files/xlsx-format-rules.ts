// Format rules in XLSX (docs/specs/029-sheets/standard-mapping.md "Format rules in the file", D215): a worksheet's
// `conditionalFormatting` read into the file model's rules, in priority order, with their differential formats
// (`dxf`) as styles; and the model's rules written as `conditionalFormatting`, one a rule. A `cfRule` the model does
// not hold is left unread, so the keeper keeps it as the file's own.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  parseXml,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  FORMAT_RULE_FORMULA_MAX,
  FORMAT_RULE_RANGES_MAX,
  FORMAT_RULES_MAX,
  FORMAT_RULE_VALUE_MAX,
} from '../limits';
import type { ConditionOp, FormatStyle, ScalePoint } from '../sheet';
import { FILE_LAST_COL } from './a1-text';
import { parseFormula } from '../formula/parse';
import { shiftFormulaText } from './formula-text-shift';
import { dummyFunction, fromExcelFormula, toExcelFormula } from './excel-formula';
import type { FileFormatRule } from './file-format-rules';
import { readThemeColours, xlsxColourOf } from './xlsx-colours';
import { cellAddress, readCellAddress, SPREADSHEETML_NS } from './xlsx-parts';

const STRICT_NS = 'http://purl.oclc.org/ooxml/spreadsheetml/main';

/** A differential format as a rule's style, and whether it says more than a style holds. */
export type XlsxDxf = { style: FormatStyle; extra: boolean };

const on = (e: XmlElement | undefined) =>
  e !== undefined && !['0', 'false', 'none'].includes(attributeOf(e, '', 'val') ?? '1');

// A font's children that name its face and size alone, which a rule's style leaves as the cell's and LibreOffice
// writes in every one: never counted as more.
const FACE: ReadonlySet<string> = new Set(['name', 'family', 'scheme', 'charset', 'sz']);
const STYLE_PARTS: ReadonlySet<string> = new Set(['b', 'i', 'u', 'strike', 'color']);

function dxfOf(dxf: XmlElement, ns: string, theme: readonly string[]): XlsxDxf {
  const style: FormatStyle = {};
  let extra = false;
  for (const part of childElements(dxf)) {
    if (part.uri !== ns) continue;
    if (part.local === 'font') {
      const child = (local: string) => childElement(part, ns, local);
      if (on(child('b'))) style.b = true;
      if (on(child('i'))) style.i = true;
      if (on(child('u'))) style.u = true;
      if (on(child('strike'))) style.st = true;
      const fc = xlsxColourOf(child('color'), theme);
      if (fc) style.fc = fc;
      extra ||= childElements(part).some((e) => !STYLE_PARTS.has(e.local) && !FACE.has(e.local));
    } else if (part.local === 'fill') {
      const pattern = childElement(part, ns, 'patternFill');
      const type = pattern && attributeOf(pattern, '', 'patternType');
      const colour = (local: string) =>
        pattern ? xlsxColourOf(childElement(pattern, ns, local), theme) : null;
      const bg = colour('bgColor') ?? colour('fgColor');
      if (bg && type !== 'none') style.bg = bg;
      extra ||= !pattern || (type !== undefined && type !== 'solid' && type !== 'none');
    } else extra ||= part.local !== 'border' || childElements(part).length > 0;
  }
  return { style, extra };
}

/** Each differential format of `xl/styles.xml`'s text, in order, its colours from the theme's. */
export function readXlsxDxfs(stylesXml: string | undefined, themeXml?: string): XlsxDxf[] {
  const parsed = stylesXml === undefined ? undefined : parseXml(stylesXml, 'xl/styles.xml');
  if (!parsed?.ok) return [];
  const ns = parsed.root.uri === STRICT_NS ? STRICT_NS : SPREADSHEETML_NS;
  const dxfs = childElement(parsed.root, ns, 'dxfs');
  const theme = readThemeColours(themeXml);
  return (dxfs ? childElements(dxfs) : [])
    .filter((e) => e.local === 'dxf')
    .map((e) => dxfOf(e, ns, theme));
}

/** A `sqref`'s ranges (`A1:A10 C1`), zero-based; null when any is not one. */
export function readSqref(text: string): FileFormatRule['ranges'] | null {
  const out: FileFormatRule['ranges'] = [];
  for (const part of text.trim().split(/\s+/)) {
    const [a, b] = part.split(':');
    const from = readCellAddress(a!);
    const to = b === undefined ? from : readCellAddress(b);
    if (!from || !to) return null;
    out.push({
      r1: Math.min(from.r, to.r),
      c1: Math.min(from.c, to.c),
      r2: Math.max(from.r, to.r),
      c2: Math.max(from.c, to.c),
    });
  }
  return out;
}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const STRING = /^"((?:[^"]|"")*)"$/s;

// A `cellIs` operand: a number or a text, or null for anything else (a reference, a formula).
function literalOf(text: string): number | string | null {
  const t = text.trim();
  if (NUMBER.test(t)) return Number(t);
  const m = STRING.exec(t);
  return m ? m[1]!.replace(/""/g, '"') : null;
}

const CELL_IS: Readonly<Record<string, ConditionOp>> = {
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
  equal: 'eq',
  notEqual: 'neq',
  between: 'between',
};
const SIGN: Readonly<Record<string, string>> = {
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  lessThan: '<',
  lessThanOrEqual: '<=',
  equal: '=',
  notEqual: '<>',
};
const TEXT_RULES: Readonly<Record<string, ConditionOp>> = {
  containsText: 'contains',
  notContainsText: 'notContains',
  beginsWith: 'startsWith',
  endsWith: 'endsWith',
};
const POINTS: Readonly<Record<string, ScalePoint['at']>> = {
  min: 'min',
  max: 'max',
  num: 'num',
  percent: 'pct',
  percentile: 'pctile',
};

type Condition = Pick<FileFormatRule, 'op' | 'a' | 'b' | 'formula'>;

// A formula of the file's (Excel's grammar) in Google's syntax, or null when it cannot be read or is too long.
function formulaOf(excel: string): string | null {
  const google = fromExcelFormula(excel);
  return google !== null && google.length <= FORMAT_RULE_FORMULA_MAX + 1 && parseFormula(google).ok
    ? google
    : null;
}

// A `cellIs` rule: a comparison with numbers or a text, else the same test as a formula (D215).
function cellIsOf(operator: string, operands: string[], anchor: string): Condition | null {
  const [f1, f2] = operands;
  if (f1 === undefined) return null;
  const a = literalOf(f1);
  const two = operator === 'between' || operator === 'notBetween';
  if (two && f2 === undefined) return null;
  const b = two ? literalOf(f2!) : null;
  const text = (x: number | string | null) => typeof x === 'string';
  const ordered = operator !== 'equal' && operator !== 'notEqual';
  const literal =
    CELL_IS[operator] &&
    a !== null &&
    (!two || b !== null) &&
    !(ordered && (text(a) || text(b))) &&
    String(a).length <= FORMAT_RULE_VALUE_MAX &&
    String(b ?? '').length <= FORMAT_RULE_VALUE_MAX;
  if (literal) return { op: CELL_IS[operator], a, ...(two ? { b: b! } : {}) };
  let excel: string | null = null;
  if (SIGN[operator]) excel = `${anchor}${SIGN[operator]}${f1}`;
  else if (two) {
    // Between its operands either way round, numbers or text, as Excel reads it.
    const inside = `OR(AND(${anchor}>=${f1},${anchor}<=${f2}),AND(${anchor}>=${f2},${anchor}<=${f1}))`;
    excel = operator === 'between' ? inside : `NOT(${inside})`;
  }
  const formula = excel === null ? null : formulaOf(excel);
  return formula === null ? null : { op: 'formula', formula };
}

// A custom formula, or Is Empty and Is Not Empty as Excel and LibreOffice write them.
function expressionOf(excel: string | undefined, anchor: string): Condition | null {
  if (excel === undefined) return null;
  const formula = formulaOf(excel);
  if (formula === null) return null;
  const plain = formula.replace(/\s+/g, '').toUpperCase();
  if (plain === `=LEN(TRIM(${anchor}))=0`) return { op: 'empty' };
  if (plain === `=LEN(TRIM(${anchor}))>0`) return { op: 'notEmpty' };
  return { op: 'formula', formula };
}

function conditionOf(rule: XmlElement, ns: string, anchor: string): Condition | null {
  const type = attributeOf(rule, '', 'type') ?? '';
  const formulas = childElements(rule)
    .filter((e) => e.uri === ns && e.local === 'formula')
    .map((e) => textContent(e));
  if (type === 'cellIs') return cellIsOf(attributeOf(rule, '', 'operator') ?? '', formulas, anchor);
  if (type === 'expression') return expressionOf(formulas[0], anchor);
  if (type === 'containsBlanks') return { op: 'empty' };
  if (type === 'notContainsBlanks') return { op: 'notEmpty' };
  const op = TEXT_RULES[type];
  const text = attributeOf(rule, '', 'text');
  if (!op || text === undefined || text.length > FORMAT_RULE_VALUE_MAX) return null;
  return { op, a: text };
}

function scaleOf(rule: XmlElement, ns: string, theme: readonly string[]) {
  const scale = childElement(rule, ns, 'colorScale');
  const kids = scale ? childElements(scale).filter((e) => e.uri === ns) : [];
  const cfvos = kids.filter((e) => e.local === 'cfvo');
  const colours = kids.filter((e) => e.local === 'color').map((e) => xlsxColourOf(e, theme));
  if ((cfvos.length !== 2 && cfvos.length !== 3) || colours.length !== cfvos.length) return null;
  const points: ScalePoint[] = [];
  for (const [i, cfvo] of cfvos.entries()) {
    const at = POINTS[attributeOf(cfvo, '', 'type') ?? ''];
    const c = colours[i];
    if (!at || !c) return null;
    const last = i === cfvos.length - 1;
    if ((at === 'max' && !last) || (at === 'min' && i > 0)) return null;
    if (at === 'min' || at === 'max') {
      points.push({ c, at });
      continue;
    }
    const v = Number(attributeOf(cfvo, '', 'val'));
    if (!Number.isFinite(v) || (at !== 'num' && (v < 0 || v > 100))) return null;
    points.push({ c, at, v });
  }
  const [min, ...rest] = points;
  const max = rest.pop()!;
  return { min: min!, ...(rest[0] ? { mid: rest[0] } : {}), max };
}

/** A worksheet's rules read, the `cfRule`s they came from, and whether a style said more than it holds. */
export type XlsxRulesRead = { rules: FileFormatRule[]; read: Set<XmlElement>; styled: boolean };

/**
 * A worksheet's format rules in priority order (the file's order among equals), up to FORMAT_RULES_MAX. A rule the
 * model does not hold, or past the limits, is left unread for the keeper.
 */
export function readXlsxFormatRules(
  root: XmlElement,
  ns: string,
  dxfs: readonly XlsxDxf[],
  theme: readonly string[],
): XlsxRulesRead {
  const found: { priority: number; at: number; element: XmlElement; rule: FileFormatRule }[] = [];
  let styled = false;
  for (const holder of childElements(root)) {
    if (holder.uri !== ns || holder.local !== 'conditionalFormatting') continue;
    const ranges = readSqref(attributeOf(holder, '', 'sqref') ?? '');
    if (!ranges || ranges.length > FORMAT_RULE_RANGES_MAX) continue;
    const anchor = cellAddress(ranges[0]!.r1, ranges[0]!.c1);
    for (const element of childElements(holder)) {
      if (element.uri !== ns || element.local !== 'cfRule') continue;
      const p = Number(attributeOf(element, '', 'priority'));
      const priority = Number.isFinite(p) ? p : Number.MAX_SAFE_INTEGER;
      let rule: FileFormatRule | null = null;
      if (attributeOf(element, '', 'type') === 'colorScale') {
        const scale = scaleOf(element, ns, theme);
        if (scale) rule = { ranges, is: 'scale', ...scale };
      } else {
        const dxf = dxfs[Number(attributeOf(element, '', 'dxfId'))];
        const condition =
          dxf && Object.keys(dxf.style).length ? conditionOf(element, ns, anchor) : null;
        if (condition) {
          rule = { ranges, is: 'when', ...condition, style: dxf!.style };
          styled ||= dxf!.extra;
        }
      }
      if (rule) found.push({ priority, at: found.length, element, rule });
    }
  }
  const taken = found
    .sort((x, y) => x.priority - y.priority || x.at - y.at)
    .slice(0, FORMAT_RULES_MAX);
  return {
    rules: taken.map((x) => x.rule),
    read: new Set(taken.map((x) => x.element)),
    styled,
  };
}

const quoted = (text: string) => `"${text.replace(/"/g, '""')}"`;
const operand = (x: string | number) => (typeof x === 'number' ? String(x) : quoted(x));

const OPERATORS: Partial<Record<ConditionOp | 'formula', string>> = {
  gt: 'greaterThan',
  gte: 'greaterThanOrEqual',
  lt: 'lessThan',
  lte: 'lessThanOrEqual',
  eq: 'equal',
  neq: 'notEqual',
  between: 'between',
};
const TEXT_TYPES: Partial<
  Record<ConditionOp | 'formula', [string, string, (t: string, a: string) => string]>
> = {
  contains: ['containsText', 'containsText', (t, a) => `NOT(ISERROR(SEARCH(${t},${a})))`],
  notContains: ['notContainsText', 'notContains', (t, a) => `ISERROR(SEARCH(${t},${a}))`],
  startsWith: ['beginsWith', 'beginsWith', (t, a) => `LEFT(${a},LEN(${t}))=${t}`],
  endsWith: ['endsWith', 'endsWith', (t, a) => `RIGHT(${a},LEN(${t}))=${t}`],
};
const CFVO: Readonly<Record<ScalePoint['at'], string>> = {
  min: 'min',
  max: 'max',
  num: 'num',
  pct: 'percent',
  pctile: 'percentile',
};

const formulaXml = (excel: string) => `<formula>${escapeXmlText(excel)}</formula>`;
const rgb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

// A rule's `cfRule`: its type, its differential format and its formulas; Excel's grammar written for the anchor.
function cfRuleXml(
  rule: FileFormatRule,
  anchor: string,
  priority: number,
  dxf: (style: FormatStyle) => number,
  renamed: ReadonlyMap<string, string>,
): string {
  if (rule.is === 'scale') {
    const points = [rule.min!, ...(rule.mid ? [rule.mid] : []), rule.max!];
    const cfvos = points.map(
      (p) => `<cfvo type="${CFVO[p.at]}"${p.v === undefined ? '' : ` val="${p.v}"`}/>`,
    );
    const colours = points.map((p) => `<color rgb="${rgb(p.c)}"/>`);
    return `<cfRule type="colorScale" priority="${priority}"><colorScale>${cfvos.join('')}${colours.join('')}</colorScale></cfRule>`;
  }
  const head = (type: string, more = '') =>
    `<cfRule type="${type}" dxfId="${dxf(rule.style!)}" priority="${priority}" stopIfTrue="1"${more}>`;
  const op = rule.op!;
  const text = TEXT_TYPES[op];
  if (text) {
    const a = String(rule.a);
    const [type, operator, excel] = text;
    return `${head(type, ` operator="${operator}" text="${escapeXmlAttribute(a)}"`)}${formulaXml(excel(quoted(a), anchor))}</cfRule>`;
  }
  if (op === 'empty')
    return `${head('containsBlanks')}${formulaXml(`LEN(TRIM(${anchor}))=0`)}</cfRule>`;
  if (op === 'notEmpty')
    return `${head('notContainsBlanks')}${formulaXml(`LEN(TRIM(${anchor}))>0`)}</cfRule>`;
  const operator = OPERATORS[op];
  if (operator) {
    const operands = [rule.a, rule.b]
      .filter((x) => x !== undefined)
      .map((x) => formulaXml(operand(x)));
    return `${head('cellIs', ` operator="${operator}"`)}${operands.join('')}</cfRule>`;
  }
  // A custom formula Excel cannot hold is kept whole by S5's convention, meeting nothing there.
  const formula = rule.formula!;
  const excel = toExcelFormula(formula, renamed) ?? dummyFunction(formula, false);
  return `${head('expression')}${formulaXml(excel)}</cfRule>`;
}

/**
 * A sheet's rules as `conditionalFormatting` children, one a rule, numbered from `first` in list order; a range past
 * Excel's last column is cut there, and a rule with none left out.
 */
export function xlsxFormatRulesXml(
  rules: readonly FileFormatRule[] | undefined,
  first: number,
  dxf: (style: FormatStyle) => number,
  renamed: ReadonlyMap<string, string>,
): { name: string; xml: string }[] {
  const out: { name: string; xml: string }[] = [];
  for (const rule of rules ?? []) {
    const ranges = rule.ranges
      .filter((g) => g.c1 < FILE_LAST_COL)
      .map((g) => ({ ...g, c2: Math.min(g.c2, FILE_LAST_COL - 1) }));
    if (!ranges.length) continue;
    const sqref = ranges
      .map((g) => {
        const a = cellAddress(g.r1, g.c1);
        return g.r1 === g.r2 && g.c1 === g.c2 ? a : `${a}:${cellAddress(g.r2, g.c2)}`;
      })
      .join(' ');
    // A formula follows the anchor when the first range is past Excel's last column.
    const g = ranges[0]!;
    const was = rule.ranges[0]!;
    const formula = rule.formula && shiftFormulaText(rule.formula, g.r1 - was.r1, g.c1 - was.c1);
    const anchor = cellAddress(g.r1, g.c1);
    const cf = cfRuleXml(
      { ...rule, ...(formula ? { formula } : {}) },
      anchor,
      first + out.length,
      dxf,
      renamed,
    );
    out.push({
      name: 'conditionalFormatting',
      xml: `<conditionalFormatting sqref="${sqref}">${cf}</conditionalFormatting>`,
    });
  }
  return out;
}

/** A rule's style as a differential format. */
export function dxfXml(style: FormatStyle): string {
  const font =
    (style.b ? '<b/>' : '') +
    (style.i ? '<i/>' : '') +
    (style.st ? '<strike/>' : '') +
    (style.u ? '<u/>' : '') +
    (style.fc ? `<color rgb="${rgb(style.fc)}"/>` : '');
  const fill = style.bg
    ? `<fill><patternFill><bgColor rgb="${rgb(style.bg)}"/></patternFill></fill>`
    : '';
  return `<dxf>${font ? `<font>${font}</font>` : ''}${fill}</dxf>`;
}
