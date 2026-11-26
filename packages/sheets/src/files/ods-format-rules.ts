// Format rules in ODF (docs/specs/029-sheets/standard-mapping.md "Format rules in the file", D215): a table's
// LibreOffice `calcext:conditional-formats` read into the file model's rules, in file order, each condition's named
// cell style as its style; and the model's rules written as `calcext:conditional-format`s, one a rule, each style a
// named cell style. A condition the model does not hold is left unread, so the keeper keeps it as the file's own.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import type { GridRange } from '../address';
import { parseFormula } from '../formula/parse';
import {
  FORMAT_RULE_FORMULA_MAX,
  FORMAT_RULE_RANGES_MAX,
  FORMAT_RULES_MAX,
  FORMAT_RULE_VALUE_MAX,
} from '../limits';
import type { ConditionOp, FormatStyle, ScalePoint } from '../sheet';
import type { FileFormatRule } from './file-format-rules';
import { shiftFormulaText } from './formula-text-shift';
import type { OdsCellLooks } from './ods-cell-style';
import { fromOpenFormula, OPEN_FORMULA_PREFIX, toOpenFormula } from './open-formula';
import { cellAddress, readCellAddress } from './xlsx-parts';

const { calcext: CALCEXT } = ODF_NS;

// Splits `text` at `separators` outside quotes ('…' and "…") and brackets.
function splitOutside(text: string, separators: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && separators.test(ch)) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out;
}

// A cell of an ODF address (`'My sheet'.$B$2`, `.B2`), its sheet left aside; null when it is not one.
function odfCell(text: string): { r: number; c: number } | null {
  const parts = splitOutside(text, /\./);
  return readCellAddress(parts[parts.length - 1]!);
}

/** A `calcext:target-range-address`'s ranges (`S.A1:S.A10 S.C1`), zero-based; null when any is not one. */
export function readOdfRanges(text: string): GridRange[] | null {
  const out: GridRange[] = [];
  for (const part of splitOutside(text.trim(), /\s/).filter(Boolean)) {
    const [a, b, more] = splitOutside(part, /:/);
    const from = odfCell(a!);
    const to = b === undefined ? from : odfCell(b);
    if (!from || !to || more !== undefined) return null;
    out.push({
      r1: Math.min(from.r, to.r),
      c1: Math.min(from.c, to.c),
      r2: Math.max(from.r, to.r),
      c2: Math.max(from.c, to.c),
    });
  }
  return out.length ? out : null;
}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const STRING = /^"((?:[^"]|"")*)"$/s;

// An operand: a number or a text, or null for anything else (a reference, a formula).
function literalOf(text: string): number | string | null {
  const t = text.trim();
  if (NUMBER.test(t)) return Number(t);
  const m = STRING.exec(t);
  return m ? m[1]!.replace(/""/g, '"') : null;
}

type Condition = Pick<FileFormatRule, 'op' | 'a' | 'b' | 'formula'>;

// An ODF expression (`[.$A1]>20`) in Google's syntax for the anchor, moved from its base cell; null when it cannot be
// read or is too long.
function formulaOf(expression: string, shift: { dr: number; dc: number }): string | null {
  const google = fromOpenFormula(`${OPEN_FORMULA_PREFIX}=${expression}`);
  if (google === null || !parseFormula(google).ok) return null;
  const moved = shiftFormulaText(google, shift.dr, shift.dc);
  return moved.length <= FORMAT_RULE_FORMULA_MAX + 1 ? moved : null;
}

const COMPARE: Readonly<Record<string, [ConditionOp, string]>> = {
  '>': ['gt', '>'],
  '>=': ['gte', '>='],
  '<': ['lt', '<'],
  '<=': ['lte', '<='],
  '=': ['eq', '='],
  '!=': ['neq', '<>'],
};
const TEXT_TESTS: Readonly<Record<string, ConditionOp>> = {
  'contains-text': 'contains',
  'not-contains-text': 'notContains',
  'begins-with': 'startsWith',
  'ends-with': 'endsWith',
};
const ORDERED = new Set(['gt', 'gte', 'lt', 'lte', 'between', 'notBetween']);

/** A `calcext:value` as a condition, for a rule whose anchor is `anchor` (its base cell `shift` away); or null. */
export function odfCondition(
  value: string,
  anchor: { r: number; c: number },
  shift: { dr: number; dc: number },
): Condition | null {
  const at = `[.${cellAddress(anchor.r - shift.dr, anchor.c - shift.dc)}]`;
  const call = /^([a-z-]+)\((.*)\)$/s.exec(value.trim());
  if (call) {
    const [, name, inner] = call;
    const args = splitOutside(inner!, /[,;]/);
    if (name === 'formula-is') {
      const formula = formulaOf(inner!, shift);
      if (formula === null) return null;
      const plain = formula.replace(/\s+/g, '').toUpperCase();
      const own = cellAddress(anchor.r, anchor.c);
      if (plain === `=LEN(TRIM(${own}))=0`) return { op: 'empty' };
      if (plain === `=LEN(TRIM(${own}))>0`) return { op: 'notEmpty' };
      return { op: 'formula', formula };
    }
    const text = TEXT_TESTS[name!];
    if (text) {
      const a = args.length === 1 ? literalOf(args[0]!) : null;
      return typeof a === 'string' && a.length <= FORMAT_RULE_VALUE_MAX ? { op: text, a } : null;
    }
    if ((name === 'between' || name === 'not-between') && args.length === 2) {
      const [f1, f2] = args.map((x) => x.trim());
      const a = literalOf(f1!);
      const b = literalOf(f2!);
      if (typeof a === 'number' && typeof b === 'number')
        return { op: name === 'between' ? 'between' : 'notBetween', a, b };
      const inside = `OR(AND(${at}>=${f1};${at}<=${f2});AND(${at}>=${f2};${at}<=${f1}))`;
      const formula = formulaOf(name === 'between' ? inside : `NOT(${inside})`, shift);
      return formula === null ? null : { op: 'formula', formula };
    }
    return null;
  }
  const m = /^(>=|<=|!=|>|<|=)(.*)$/s.exec(value.trim());
  if (!m) return null;
  const [op, sign] = COMPARE[m[1]!]!;
  const a = literalOf(m[2]!);
  if (
    a !== null &&
    !(typeof a === 'string' && ORDERED.has(op)) &&
    String(a).length <= FORMAT_RULE_VALUE_MAX
  )
    return { op, a };
  const formula = formulaOf(`${at}${sign}${m[2]!.trim()}`, shift);
  return formula === null ? null : { op: 'formula', formula };
}

const POINTS: Readonly<Record<string, ScalePoint['at']>> = {
  minimum: 'min',
  maximum: 'max',
  number: 'num',
  percent: 'pct',
  percentile: 'pctile',
};
const COLOUR = /^#[0-9a-f]{6}$/i;

function scaleOf(scale: XmlElement) {
  const entries = childElements(scale).filter(
    (e) => e.uri === CALCEXT && e.local === 'color-scale-entry',
  );
  if (entries.length !== 2 && entries.length !== 3) return null;
  const points: ScalePoint[] = [];
  for (const [i, entry] of entries.entries()) {
    const at = POINTS[attributeOf(entry, CALCEXT, 'type') ?? ''];
    const c = attributeOf(entry, CALCEXT, 'color') ?? '';
    if (!at || !COLOUR.test(c)) return null;
    if ((at === 'max' && i < entries.length - 1) || (at === 'min' && i > 0)) return null;
    if (at === 'min' || at === 'max') {
      points.push({ c: c.toLowerCase(), at });
      continue;
    }
    const v = Number(attributeOf(entry, CALCEXT, 'value'));
    if (!Number.isFinite(v) || (at !== 'num' && (v < 0 || v > 100))) return null;
    points.push({ c: c.toLowerCase(), at, v });
  }
  const [min, ...rest] = points;
  const max = rest.pop()!;
  return { min: min!, ...(rest[0] ? { mid: rest[0] } : {}), max };
}

/** A table's rules read, the conditions they came from, and whether a style said more than a rule's style holds. */
export type OdsRulesRead = { rules: FileFormatRule[]; read: Set<XmlElement>; styled: boolean };

const FACE_KEYS: ReadonlySet<string> = new Set(['ff', 'fs']);
const STYLE_KEYS: ReadonlySet<string> = new Set(['b', 'i', 'u', 'st', 'fc', 'bg']);

/**
 * A table's format rules in file order, up to FORMAT_RULES_MAX. A condition the model does not hold, its style one
 * that sets nothing a rule's style holds, or a rule past the limits is left unread for the keeper.
 */
export function readOdsFormatRules(table: XmlElement, looks: OdsCellLooks): OdsRulesRead {
  const out: OdsRulesRead = { rules: [], read: new Set(), styled: false };
  const holder = childElements(table).find(
    (e) => e.uri === CALCEXT && e.local === 'conditional-formats',
  );
  for (const format of holder ? childElements(holder) : []) {
    if (format.uri !== CALCEXT || format.local !== 'conditional-format') continue;
    const ranges = readOdfRanges(attributeOf(format, CALCEXT, 'target-range-address') ?? '');
    if (!ranges || ranges.length > FORMAT_RULE_RANGES_MAX) continue;
    const anchor = { r: ranges[0]!.r1, c: ranges[0]!.c1 };
    for (const element of childElements(format)) {
      if (out.rules.length === FORMAT_RULES_MAX) return out;
      if (element.uri !== CALCEXT) continue;
      let rule: FileFormatRule | null = null;
      if (element.local === 'color-scale') {
        const scale = scaleOf(element);
        if (scale) rule = { ranges, is: 'scale', ...scale };
      } else if (element.local === 'condition') {
        const look = looks.own(attributeOf(element, CALCEXT, 'apply-style-name') ?? '');
        const style: FormatStyle = Object.fromEntries(
          Object.entries(look?.style ?? {}).filter(([k]) => STYLE_KEYS.has(k)),
        );
        const base = odfCell(attributeOf(element, CALCEXT, 'base-cell-address') ?? '') ?? anchor;
        const shift = { dr: anchor.r - base.r, dc: anchor.c - base.c };
        const condition = Object.keys(style).length
          ? odfCondition(attributeOf(element, CALCEXT, 'value') ?? '', anchor, shift)
          : null;
        if (condition) {
          rule = { ranges, is: 'when', ...condition, style };
          out.styled ||=
            look!.lost ||
            Object.keys(look!.style!).some((k) => !STYLE_KEYS.has(k) && !FACE_KEYS.has(k));
        }
      }
      if (!rule) continue;
      out.rules.push(rule);
      out.read.add(element);
    }
  }
  return out;
}

/** The styles a table's format rules left unread name, which the keeper keeps with them. */
export function unreadStyleNames(table: XmlElement, read: ReadonlySet<XmlElement>): string[] {
  const holder = childElements(table).find(
    (e) => e.uri === CALCEXT && e.local === 'conditional-formats',
  );
  const out: string[] = [];
  for (const format of holder ? childElements(holder) : [])
    for (const element of childElements(format)) {
      const name = read.has(element)
        ? undefined
        : attributeOf(element, CALCEXT, 'apply-style-name');
      if (name !== undefined) out.push(name);
    }
  return out;
}

// A sheet name as an ODF address names it: quoted unless plain.
const sheetPart = (name: string) =>
  /^[A-Za-z_][\w]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
const quoted = (text: string) => `"${text.replace(/"/g, '""')}"`;
const operand = (x: string | number) => (typeof x === 'number' ? String(x) : quoted(x));
const SIGNS: Partial<Record<ConditionOp | 'formula', string>> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  neq: '!=',
};
const TEXT_NAMES: Partial<Record<ConditionOp | 'formula', string>> = {
  contains: 'contains-text',
  notContains: 'not-contains-text',
  startsWith: 'begins-with',
  endsWith: 'ends-with',
};
const ENTRY_TYPES: Readonly<Record<ScalePoint['at'], string>> = {
  min: 'minimum',
  max: 'maximum',
  num: 'number',
  pct: 'percent',
  pctile: 'percentile',
};

// A Google formula as a `formula-is` expression; Google's syntax kept whole when OpenFormula cannot say it.
function expressionOf(formula: string): string {
  const open = toOpenFormula(formula);
  return open === null ? formula.replace(/^=/, '') : open.slice(OPEN_FORMULA_PREFIX.length + 1);
}

function conditionValue(rule: FileFormatRule, anchor: string): string {
  const op = rule.op!;
  const sign = SIGNS[op];
  if (sign) return `${sign}${operand(rule.a!)}`;
  if (op === 'between') return `between(${operand(rule.a!)},${operand(rule.b!)})`;
  if (op === 'notBetween') return `not-between(${operand(rule.a!)},${operand(rule.b!)})`;
  const text = TEXT_NAMES[op];
  if (text) return `${text}(${quoted(String(rule.a))})`;
  if (op === 'empty') return `formula-is(LEN(TRIM([.${anchor}]))=0)`;
  if (op === 'notEmpty') return `formula-is(LEN(TRIM([.${anchor}]))>0)`;
  return `formula-is(${expressionOf(rule.formula!)})`;
}

/**
 * A sheet's rules as `calcext:conditional-format`s, one a rule, in list order; `styleName` names a rule's style as
 * a common cell style.
 */
export function odsFormatRulesXml(
  rules: readonly FileFormatRule[] | undefined,
  sheet: string,
  styleName: (style: FormatStyle) => string,
): string[] {
  const prefix = sheetPart(sheet);
  return (rules ?? []).map((rule) => {
    const address = (r: number, c: number) => `${prefix}.${cellAddress(r, c)}`;
    const target = rule.ranges
      .map((g) =>
        g.r1 === g.r2 && g.c1 === g.c2
          ? address(g.r1, g.c1)
          : `${address(g.r1, g.c1)}:${address(g.r2, g.c2)}`,
      )
      .join(' ');
    const g = rule.ranges[0]!;
    const open = `<calcext:conditional-format calcext:target-range-address="${escapeXmlAttribute(target)}">`;
    if (rule.is === 'scale') {
      const points = [rule.min!, ...(rule.mid ? [rule.mid] : []), rule.max!];
      const entries = points.map(
        (p) =>
          `<calcext:color-scale-entry calcext:value="${p.v ?? 0}" calcext:type="${ENTRY_TYPES[p.at]}" calcext:color="${p.c}"/>`,
      );
      return `${open}<calcext:color-scale>${entries.join('')}</calcext:color-scale></calcext:conditional-format>`;
    }
    const value = conditionValue(rule, cellAddress(g.r1, g.c1));
    return (
      `${open}<calcext:condition calcext:apply-style-name="${escapeXmlAttribute(styleName(rule.style!))}" ` +
      `calcext:value="${escapeXmlAttribute(value)}" calcext:base-cell-address="${escapeXmlAttribute(address(g.r1, g.c1))}"/>` +
      '</calcext:conditional-format>'
    );
  });
}
