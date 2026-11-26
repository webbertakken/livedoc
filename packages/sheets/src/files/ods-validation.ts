// Validation rules in ODF (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D289 to D292): the
// spreadsheet's `table:content-validations`, one `table:content-validation` a rule as its closest standard rule with
// LiveDoc's exact rule in `livedoc:` attributes, and each cell naming its rule. A rule the model does not hold is left
// unread, so the keeper keeps it, and its cells' names, as the file's own.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  ODF_NS,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import type { GridRange } from '../address';
import { VALIDATION_HELP_MAX } from '../limits';
import { splitSheetText } from '../rules/rule-source';
import type { NumOp } from '../sheet';
import { sheetPrefix } from './a1-text';
import type { FileValidationRule, FileValidationSettings } from './file-validation';
import { shiftFormulaText } from './formula-text-shift';
import {
  odfExpressionOf,
  odfFormulaOf,
  readOdfRanges,
  sheetPart,
  splitOutside,
} from './ods-format-rules';
import { fromOpenFormula, OPEN_FORMULA_PREFIX, toOpenFormula } from './open-formula';
import {
  LIVEDOC_SPREADSHEET_NS,
  liveDocRuleText,
  readValidation,
  standardRuleOf,
  validationFingerprint,
  type StandardCheck,
  type StandardRule,
} from './validation-standard';
import { cellAddress } from './xlsx-parts';
import type { WorkbookFile } from './workbook-file';

const { table: TABLE, text: TEXT } = ODF_NS;

/** The name LiveDoc gives its rules, numbered from 1 (`LiveDocValidation1`). */
export const ODS_VALIDATION_NAME = 'LiveDocValidation';

const SIGNS: Readonly<Record<NumOp, string>> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  neq: '!=',
  between: '',
  notBetween: '',
};
const SIGN_OPS: Readonly<Record<string, NumOp>> = {
  ...Object.fromEntries(Object.entries(SIGNS).map(([op, sign]) => [sign, op as NumOp])),
  '<>': 'neq',
};
const KINDS: Readonly<Record<'num' | 'date', string>> = {
  num: 'cell-content-is-decimal-number()',
  date: 'cell-content-is-date()',
};

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const STRING = /^"((?:[^"]|"")*)"$/s;
const quoted = (s: string) => `"${s.replace(/"/g, '""')}"`;
// An OpenFormula expression without its `of:=`.
const expression = (open: string) => open.slice(OPEN_FORMULA_PREFIX.length + 1);

// A range's text (`'My Lists'!A1:A3`) as an absolute ODF reference (`[$'My Lists'.$A$1:.$A$3]`).
function absoluteRef(src: string): string | null {
  const { title, range } = splitSheetText(src);
  const g = readOdfRanges(range);
  if (!g || g.length !== 1) return null;
  const at = (r: number, c: number) => cellAddress(r, c).replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
  const text = `=${title === null ? '' : sheetPrefix(title)}${at(g[0]!.r1, g[0]!.c1)}:${at(g[0]!.r2, g[0]!.c2)}`;
  const open = toOpenFormula(text);
  return open === null ? null : expression(open);
}

/** A check as a `table:condition`; '' for one allowing anything. */
function conditionOf(check: StandardCheck): string {
  switch (check.k) {
    case 'list':
      return `of:cell-content-is-in-list(${check.items.map(quoted).join(';')})`;
    case 'range': {
      const ref = absoluteRef(check.src);
      return ref === null ? '' : `of:cell-content-is-in-list(${ref})`;
    }
    case 'num':
    case 'date': {
      const b = check.b ?? 0;
      const test =
        check.op === 'between'
          ? `cell-content-is-between(${check.a},${b})`
          : check.op === 'notBetween'
            ? `cell-content-is-not-between(${check.a},${b})`
            : `cell-content()${SIGNS[check.op]}${check.a}`;
      return `of:${KINDS[check.k]} and ${test}`;
    }
    case 'formula':
      return `of:is-true-formula(${odfExpressionOf(check.fx)})`;
    case 'any':
      return '';
  }
}

/** A standard rule as `table:content-validation` writes it: its condition, error type and help; absent is ''. */
type Written = { condition: string; error: string; help: string };

const fingerprintOf = (w: Written) => validationFingerprint([w.condition, w.error, w.help]);

const writtenOf = (std: StandardRule): Written => ({
  condition: conditionOf(std.check),
  error: std.strict ? 'stop' : 'warning',
  help: std.help ?? '',
});

/** The rules LiveDoc writes: each `table:content-validation`, and each sheet's rectangles with their rule's name. */
export type OdsValidationsOut = {
  elements: string[];
  cells: { name: string; range: GridRange }[][];
};

/**
 * Every sheet's rules as `table:content-validation`s, named `LiveDocValidation1`, ... past any name `taken` (a kept
 * rule's), each based at its top-left cell.
 */
export function odsValidationsOut(
  file: WorkbookFile,
  taken: (name: string) => boolean,
): OdsValidationsOut {
  const out: OdsValidationsOut = { elements: [], cells: [] };
  let n = 0;
  for (const sheet of file.sheets) {
    const cells: OdsValidationsOut['cells'][number] = [];
    for (const rule of sheet.validations ?? []) {
      let name: string;
      do name = `${ODS_VALIDATION_NAME}${++n}`;
      while (taken(name));
      const { ranges, ...settings } = rule;
      const g = ranges[0]!;
      const w = writtenOf(standardRuleOf(settings, cellAddress(g.r1, g.c1)));
      const list = rule.is === 'list' || rule.is === 'range' || rule.is === 'check';
      const base = `${sheetPart(sheet.name)}.${cellAddress(g.r1, g.c1)}`;
      out.elements.push(
        `<table:content-validation xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}" table:name="${name}"` +
          (w.condition ? ` table:condition="${escapeXmlAttribute(w.condition)}"` : '') +
          ` table:allow-empty-cell="true"${list ? ' table:display-list="unsorted"' : ''}` +
          ` table:base-cell-address="${escapeXmlAttribute(base)}"` +
          ` livedoc:rule="${escapeXmlAttribute(liveDocRuleText(settings))}" livedoc:fingerprint="${fingerprintOf(w)}">` +
          (w.help
            ? `<table:help-message table:display="true">${w.help
                .split('\n')
                .map((line) => `<text:p>${escapeXmlText(line)}</text:p>`)
                .join('')}</table:help-message>`
            : '') +
          `<table:error-message table:message-type="${w.error}" table:display="true"/>` +
          '</table:content-validation>',
      );
      for (const range of ranges) cells.push({ name, range });
    }
    out.cells.push(cells);
  }
  return out;
}

// A `cell-content-is-in-list`'s values, or its one range as text (`'My Lists'!A1:A3`); null for anything else.
function listOf(args: string): StandardCheck | null {
  const items = splitOutside(args, /;/).map((x) => x.trim());
  if (items.length === 1 && items[0]!.startsWith('[')) {
    const google = fromOpenFormula(`${OPEN_FORMULA_PREFIX}=${items[0]}`);
    const { title, range } = splitSheetText((google ?? '').slice(1).replace(/\$/g, ''));
    const g = readOdfRanges(range);
    if (!g || g.length !== 1) return null;
    return { k: 'range', src: title === null ? range : `${sheetPrefix(title)}${range}` };
  }
  const values: string[] = [];
  for (const item of items) {
    const literal = STRING.exec(item);
    if (literal) values.push(literal[1]!.replace(/""/g, '"'));
    else if (NUMBER.test(item)) values.push(item);
    else return null;
  }
  const kept = values.filter((v) => v.trim().length > 0);
  return kept.length ? { k: 'list', items: kept } : null;
}

const COMPARED =
  /^(?:cell-content-is-(not-)?between\(\s*([^,;]+?)\s*[,;]\s*([^,;]+?)\s*\)|cell-content\(\)\s*(<=|>=|!=|<>|<|>|=)\s*(\S+))$/s;

// A number or date test (`cell-content-is-between(1,10)`, `cell-content()>5`); null for any other.
function comparedOf(k: 'num' | 'date', test: string): StandardCheck | null {
  const m = COMPARED.exec(test.trim());
  if (!m) return null;
  if (m[2] !== undefined) {
    if (!NUMBER.test(m[2]) || !NUMBER.test(m[3]!)) return null;
    return { k, op: m[1] ? 'notBetween' : 'between', a: Number(m[2]), b: Number(m[3]) };
  }
  return NUMBER.test(m[5]!) ? { k, op: SIGN_OPS[m[4]!]!, a: Number(m[5]) } : null;
}

// A `table:condition` as a check, its formula read for the base cell; null for one the model does not hold.
function checkOf(condition: string): StandardCheck | null {
  const c = condition.trim();
  if (c === '') return { k: 'any' };
  const formula = (text: string): StandardCheck | null => {
    const fx = odfFormulaOf(text, { dr: 0, dc: 0 });
    return fx === null ? null : { k: 'formula', fx };
  };
  let m = /^of:cell-content-is-in-list\((.*)\)$/s.exec(c);
  if (m) return listOf(m[1]!);
  if ((m = /^of:is-true-formula\((.*)\)$/s.exec(c))) return formula(m[1]!);
  // Google Sheets writes a custom formula so (google-validation-export.md).
  if ((m = /^of:\s*and\s+cell-content-is-between\((.*),\s*0\)$/s.exec(c))) return formula(m[1]!);
  if ((m = /^of:cell-content-is-(decimal-number|date)\(\)\s+and\s+(.*)$/s.exec(c)))
    return comparedOf(m[1] === 'date' ? 'date' : 'num', m[2]!);
  return null;
}

/** A rule read from `table:content-validations`, by name: its settings (a formula for `base`) and whether changed. */
export type OdsValidationRead = {
  settings: FileValidationSettings;
  base: { r: number; c: number };
  changed: boolean;
};

/** The spreadsheet's rules read, by name, and the elements they came from. */
export type OdsValidationsRead = { byName: Map<string, OdsValidationRead>; read: Set<XmlElement> };

/** The spreadsheet's validation rules; one the model does not hold is left unread for the keeper. */
export function readOdsValidations(spreadsheet: XmlElement): OdsValidationsRead {
  const out: OdsValidationsRead = { byName: new Map(), read: new Set() };
  const holder = childElement(spreadsheet, TABLE, 'content-validations');
  for (const element of holder ? childElements(holder) : []) {
    if (element.uri !== TABLE || element.local !== 'content-validation') continue;
    const name = attributeOf(element, TABLE, 'name');
    const base = readOdfRanges(attributeOf(element, TABLE, 'base-cell-address') ?? '')?.[0];
    if (name === undefined || !base) continue;
    const error = childElement(element, TABLE, 'error-message');
    const help = childElement(element, TABLE, 'help-message');
    const shows = (e: XmlElement | undefined) => e && attributeOf(e, TABLE, 'display') === 'true';
    const w: Written = {
      condition: attributeOf(element, TABLE, 'condition') ?? '',
      error: shows(error) ? (attributeOf(error!, TABLE, 'message-type') ?? 'stop') : '',
      help: shows(help)
        ? childElements(help!)
            .filter((p) => p.uri === TEXT && p.local === 'p')
            .map((p) => textContent(p))
            .join('\n')
        : '',
    };
    const check = checkOf(w.condition);
    const std: StandardRule | null = check && {
      check,
      strict: w.error === 'stop',
      ...(w.help ? { help: w.help.slice(0, VALIDATION_HELP_MAX) } : {}),
    };
    const rule = attributeOf(element, LIVEDOC_SPREADSHEET_NS, 'rule');
    const liveDoc =
      rule === undefined
        ? undefined
        : { rule, fingerprint: attributeOf(element, LIVEDOC_SPREADSHEET_NS, 'fingerprint') };
    const read = readValidation(std, fingerprintOf(w), liveDoc);
    if (!read) continue;
    out.byName.set(name, { ...read, base: { r: base.r1, c: base.c1 } });
    out.read.add(element);
  }
  return out;
}

/** The cells of one table naming each read rule, gathered run by run, made into rules by rectangle. */
export class OdsValidationCells {
  private readonly runs = new Map<string, GridRange[]>();
  private readonly rules: OdsValidationsRead['byName'];

  constructor(rules: OdsValidationsRead['byName']) {
    this.rules = rules;
  }

  /** Whether a cell's rule name is one read (so its cells' names are not kept). */
  has(name: string | undefined): boolean {
    return name !== undefined && this.rules.has(name);
  }

  /** A run of cells naming `name`: rows `r` to `r2`, columns `c` to `c2`. */
  add(name: string | undefined, range: GridRange): void {
    if (!this.has(name)) return;
    const runs = this.runs.get(name!) ?? [];
    this.runs.set(name!, runs);
    // A run beside the last one, on the same rows, joins it.
    const last = runs.at(-1);
    if (last && last.r1 === range.r1 && last.r2 === range.r2 && last.c2 + 1 === range.c1)
      last.c2 = range.c2;
    else runs.push({ ...range });
  }

  /** The table's rules, in the order the file names them, each over its cells' rectangles (runs over the same columns joined). */
  fileRules(): { rules: FileValidationRule[]; changed: { r: number; c: number }[] } {
    const rules: FileValidationRule[] = [];
    const changed: { r: number; c: number }[] = [];
    for (const [name, read] of this.rules) {
      const runs = this.runs.get(name);
      if (!runs?.length) continue;
      const ranges: GridRange[] = [];
      const below = new Map<string, GridRange>();
      for (const run of runs) {
        const key = `${run.c1},${run.c2}`;
        const above = below.get(key);
        if (above && above.r2 + 1 === run.r1) above.r2 = run.r2;
        else {
          ranges.push(run);
          below.set(key, run);
        }
      }
      const g = ranges[0]!;
      const { fx, ...settings } = read.settings;
      const moved =
        fx === undefined
          ? {}
          : { fx: shiftFormulaText(fx, g.r1 - read.base.r, g.c1 - read.base.c) };
      rules.push({ ...settings, ...moved, ranges });
      if (read.changed) changed.push({ r: g.r1, c: g.c1 });
    }
    return { rules, changed };
  }
}

/** The kept content after the calculation settings with LiveDoc's rules in the kept `table:content-validations`, after its own, or in one of their own first. */
export function withValidations(after: readonly string[], own: readonly string[]): string[] {
  if (own.length === 0) return [...after];
  const at = after.findIndex((xml) => /^<[\w.-]+:content-validations\b/.test(xml));
  if (at < 0)
    return [`<table:content-validations>${own.join('')}</table:content-validations>`, ...after];
  const holder = after[at]!.replace(/^<([\w.-]+:content-validations)([^>]*?)\/>$/, '<$1$2></$1>');
  const close = holder.lastIndexOf('</');
  return after.with(at, holder.slice(0, close) + own.join('') + holder.slice(close));
}

/** A row's validation runs: the rule names over its columns, in order, none overlapping. */
export type RowRules = readonly { c1: number; c2: number; name: string }[];

/** The rules over row `r`, by column. */
export function rowRules(cells: OdsValidationsOut['cells'][number], r: number): RowRules {
  return cells
    .filter((x) => x.range.r1 <= r && r <= x.range.r2)
    .map((x) => ({ c1: x.range.c1, c2: x.range.c2, name: x.name }))
    .sort((a, b) => a.c1 - b.c1);
}

/** The rule name over column `c` of a row, if any. */
export const ruleAt = (rules: RowRules, c: number): string | undefined =>
  rules.find((x) => x.c1 <= c && c <= x.c2)?.name;

/** Columns `from` to `to` (exclusive) split where the rules over them change: each run and its rule's name. */
export function ruledRuns(
  rules: RowRules,
  from: number,
  to: number,
): { n: number; name?: string }[] {
  const out: { n: number; name?: string }[] = [];
  let at = from;
  for (const x of rules) {
    if (x.c2 < at || x.c1 >= to) continue;
    if (x.c1 > at) out.push({ n: x.c1 - at });
    const end = Math.min(x.c2 + 1, to);
    out.push({ n: end - Math.max(x.c1, at), name: x.name });
    at = end;
  }
  if (to > at) out.push({ n: to - at });
  return out;
}
