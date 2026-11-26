// Validation rules in XLSX (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D293 to D296): a
// worksheet's `dataValidations`, one `dataValidation` a rule as its closest standard rule, and LiveDoc's exact rules in
// one `extLst` `ext` under LiveDoc's namespace, each naming its standard rule by `sqref` and fingerprint. A rule the
// model does not hold is left unread, so the keeper keeps it as the file's own.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import { formatA1, parseRangeText, type GridRange } from '../address';
import { FORMAT_RULE_RANGES_MAX, VALIDATION_HELP_MAX } from '../limits';
import { splitSheetText } from '../rules/rule-source';
import type { NumOp } from '../sheet';
import { FILE_LAST_COL, sheetPrefix } from './a1-text';
import { dummyFunction, toExcelFormula } from './excel-formula';
import type { FileValidationRule, FileValidationSettings } from './file-validation';
import { shiftFormulaText } from './formula-text-shift';
import {
  LIVEDOC_SPREADSHEET_NS,
  liveDocRuleText,
  readValidation,
  standardRuleOf,
  validationFingerprint,
  type LiveDocRuleAttributes,
  type StandardCheck,
  type StandardRule,
} from './validation-standard';
import { googleFormulaOf, readSqref } from './xlsx-format-rules';
import { cellAddress } from './xlsx-parts';

/** The most characters an XLSX list of values holds between its quotes (Excel's limit). */
export const XLSX_LIST_TEXT_MAX = 255;

const OPERATORS: Readonly<Record<NumOp, string>> = {
  between: 'between',
  notBetween: 'notBetween',
  gt: 'greaterThan',
  gte: 'greaterThanOrEqual',
  lt: 'lessThan',
  lte: 'lessThanOrEqual',
  eq: 'equal',
  neq: 'notEqual',
};
const OPERATOR_OPS: Readonly<Record<string, NumOp>> = Object.fromEntries(
  Object.entries(OPERATORS).map(([op, name]) => [name, op as NumOp]),
);

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const LIST = /^"((?:[^"]|"")*)"$/s;

/** A standard rule as `dataValidation` writes it, each value the attribute's or formula's text; absent is ''. */
type Written = {
  type: string;
  operator: string;
  formula1: string;
  formula2: string;
  showErrorMessage: string;
  errorStyle: string;
  prompt: string;
};

const fingerprintOf = (w: Written) =>
  validationFingerprint([
    w.type,
    w.operator,
    w.formula1,
    w.formula2,
    w.showErrorMessage,
    w.errorStyle,
    w.prompt,
  ]);

const sqrefOf = (ranges: readonly GridRange[]) =>
  ranges
    .map((g) => {
      const a = cellAddress(g.r1, g.c1);
      return g.r1 === g.r2 && g.c1 === g.c2 ? a : `${a}:${cellAddress(g.r2, g.c2)}`;
    })
    .join(' ');

// A range's text (`'My Lists'!A1:A3`) as an absolute reference in Excel's grammar, its sheet as `renamed` maps it.
function absoluteRef(src: string, renamed: ReadonlyMap<string, string>): string | null {
  const { title, range } = splitSheetText(src);
  const g = parseRangeText(range);
  if (!g) return null;
  const at = (r: number, c: number) => formatA1(r, c, { row: true, col: true });
  const prefix = title === null ? '' : sheetPrefix(renamed.get(title) ?? title);
  return `${prefix}${at(g.r1, g.c1)}:${at(g.r2, g.c2)}`;
}

// A check as `dataValidation` says it: its type, operator and formulas; a list it cannot say allows anything (D295).
function writtenCheck(
  check: StandardCheck,
  renamed: ReadonlyMap<string, string>,
): Pick<Written, 'type' | 'operator' | 'formula1' | 'formula2'> {
  const none = { type: '', operator: '', formula1: '', formula2: '' };
  switch (check.k) {
    case 'list': {
      const inner = check.items.map((v) => v.replace(/"/g, '""')).join(',');
      const fits = check.items.every((v) => !v.includes(',')) && inner.length <= XLSX_LIST_TEXT_MAX;
      return fits ? { ...none, type: 'list', formula1: `"${inner}"` } : none;
    }
    case 'range': {
      const ref = absoluteRef(check.src, renamed);
      return ref === null ? none : { ...none, type: 'list', formula1: ref };
    }
    case 'num':
    case 'date':
      return {
        type: check.k === 'num' ? 'decimal' : 'date',
        // `between` is the schema's default, written all the same.
        operator: OPERATORS[check.op],
        formula1: String(check.a),
        formula2: check.b === undefined ? '' : String(check.b),
      };
    // A formula Excel cannot hold is kept whole by S5's convention, allowing every value there.
    case 'formula':
      return {
        ...none,
        type: 'custom',
        formula1: toExcelFormula(check.fx, renamed) ?? dummyFunction(check.fx, true),
      };
    case 'any':
      return none;
  }
}

function writtenOf(std: StandardRule, renamed: ReadonlyMap<string, string>): Written {
  return {
    ...writtenCheck(std.check, renamed),
    showErrorMessage: '1',
    errorStyle: std.strict ? '' : 'warning',
    prompt: std.help ?? '',
  };
}

function dataValidationXml(w: Written, sqref: string): string {
  const attr = (name: string, value: string) =>
    value === '' ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;
  const formula = (name: string, value: string) =>
    value === '' ? '' : `<${name}>${escapeXmlText(value)}</${name}>`;
  return (
    `<dataValidation${attr('type', w.type)}${attr('errorStyle', w.errorStyle)}${attr('operator', w.operator)}` +
    ` allowBlank="1"${w.prompt ? ' showInputMessage="1"' : ''}${attr('showErrorMessage', w.showErrorMessage)}` +
    `${attr('prompt', w.prompt)} sqref="${sqref}">${formula('formula1', w.formula1)}${formula('formula2', w.formula2)}</dataValidation>`
  );
}

// A rule's settings with its source's sheet as `renamed` maps it, so LiveDoc's rule finds it in the file.
function renamedSource(
  rule: FileValidationSettings,
  renamed: ReadonlyMap<string, string>,
): FileValidationSettings {
  if (rule.src === undefined) return rule;
  const { title, range } = splitSheetText(rule.src);
  const now = title === null ? undefined : renamed.get(title);
  return now === undefined ? rule : { ...rule, src: `${sheetPrefix(now)}${range}` };
}

/** A sheet's rules as XLSX holds them: its `dataValidation`s and LiveDoc's `ext`; none for no rules. */
export type XlsxValidationsOut = { validations: string[]; ext: string | null };

/**
 * A sheet's rules as `dataValidation`s, each with LiveDoc's rule in one `ext`; a range past Excel's last column is
 * cut there, and a rule with none left out.
 */
export function xlsxValidationsXml(
  rules: readonly FileValidationRule[] | undefined,
  renamed: ReadonlyMap<string, string>,
): XlsxValidationsOut {
  const validations: string[] = [];
  const own: string[] = [];
  for (const rule of rules ?? []) {
    const ranges = rule.ranges
      .filter((g) => g.c1 < FILE_LAST_COL)
      .map((g) => ({ ...g, c2: Math.min(g.c2, FILE_LAST_COL - 1) }));
    if (!ranges.length) continue;
    const { ranges: was, ...settings } = rule;
    // A formula follows the top-left cell when the first range is past Excel's last column.
    const fx =
      settings.fx &&
      shiftFormulaText(settings.fx, ranges[0]!.r1 - was[0]!.r1, ranges[0]!.c1 - was[0]!.c1);
    const moved = { ...renamedSource(settings, renamed), ...(fx ? { fx } : {}) };
    const written = writtenOf(
      standardRuleOf(moved, cellAddress(ranges[0]!.r1, ranges[0]!.c1)),
      renamed,
    );
    const sqref = sqrefOf(ranges);
    validations.push(dataValidationXml(written, sqref));
    own.push(
      `<livedoc:dataValidation sqref="${sqref}" fingerprint="${fingerprintOf(written)}" rule="${escapeXmlAttribute(liveDocRuleText(moved))}"/>`,
    );
  }
  const ext = own.length
    ? `<ext uri="${LIVEDOC_SPREADSHEET_NS}" xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"><livedoc:dataValidations>${own.join('')}</livedoc:dataValidations></ext>`
    : null;
  return { validations, ext };
}

// A formula's text in Google's syntax, or null when it cannot be read.
const googleOf = (excel: string) => (excel.trim() ? googleFormulaOf(excel) : null);

// A `list`'s values, or its one range as text (`'My Lists'!A1:A3`); null for a formula or a name.
function listCheck(formula1: string): StandardCheck | null {
  const literal = LIST.exec(formula1.trim());
  if (literal) {
    const items = literal[1]!
      .replace(/""/g, '"')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    return items.length ? { k: 'list', items } : null;
  }
  const google = googleOf(formula1);
  const { title, range } = splitSheetText((google ?? '').slice(1).replace(/\$/g, ''));
  if (!parseRangeText(range)) return null;
  return { k: 'range', src: title === null ? range : `${sheetPrefix(title)}${range}` };
}

function checkOf(w: Written): StandardCheck | null {
  switch (w.type) {
    case '':
    case 'none':
      return { k: 'any' };
    case 'list':
      return listCheck(w.formula1);
    case 'decimal':
    case 'date': {
      const op = OPERATOR_OPS[w.operator || 'between'];
      const two = op === 'between' || op === 'notBetween';
      if (!op || !NUMBER.test(w.formula1.trim()) || (two && !NUMBER.test(w.formula2.trim())))
        return null;
      const k = w.type === 'decimal' ? 'num' : 'date';
      return { k, op, a: Number(w.formula1), ...(two ? { b: Number(w.formula2) } : {}) };
    }
    case 'custom': {
      const fx = googleOf(w.formula1);
      return fx === null ? null : { k: 'formula', fx };
    }
    default:
      return null;
  }
}

/** A worksheet's rules read, the elements they came from (LiveDoc's `ext` among them), and the changed ones' cells. */
export type XlsxValidationsRead = {
  rules: FileValidationRule[];
  read: Set<XmlElement>;
  changed: { r: number; c: number }[];
};

// LiveDoc's rules of a worksheet's `extLst`, by `sqref`, and the `ext` holding them.
function liveDocRules(root: XmlElement, ns: string) {
  const bySqref = new Map<string, LiveDocRuleAttributes>();
  const extLst = childElement(root, ns, 'extLst');
  const ext = (extLst ? childElements(extLst) : []).find(
    (e) => e.local === 'ext' && attributeOf(e, '', 'uri') === LIVEDOC_SPREADSHEET_NS,
  );
  const holder = ext && childElement(ext, LIVEDOC_SPREADSHEET_NS, 'dataValidations');
  for (const entry of holder ? childElements(holder) : []) {
    const sqref = attributeOf(entry, '', 'sqref');
    const rule = attributeOf(entry, '', 'rule');
    if (entry.local !== 'dataValidation' || sqref === undefined || rule === undefined) continue;
    bySqref.set(sqref.trim().replace(/\s+/g, ' ').toUpperCase(), {
      rule,
      fingerprint: attributeOf(entry, '', 'fingerprint'),
    });
  }
  return { bySqref, ext };
}

/** A worksheet's validation rules in the file's order; one the model does not hold is left unread for the keeper. */
export function readXlsxValidations(root: XmlElement, ns: string): XlsxValidationsRead {
  const out: XlsxValidationsRead = { rules: [], read: new Set(), changed: [] };
  const { bySqref, ext } = liveDocRules(root, ns);
  if (ext) out.read.add(ext);
  const holder = childElement(root, ns, 'dataValidations');
  for (const element of holder ? childElements(holder) : []) {
    if (element.uri !== ns || element.local !== 'dataValidation') continue;
    const sqref = (attributeOf(element, '', 'sqref') ?? '').trim().replace(/\s+/g, ' ');
    const ranges = readSqref(sqref);
    if (!ranges || ranges.length > FORMAT_RULE_RANGES_MAX) continue;
    const formula = (local: string) => {
      const e = childElement(element, ns, local);
      return e ? textContent(e) : '';
    };
    const w: Written = {
      type: attributeOf(element, '', 'type') ?? '',
      operator: attributeOf(element, '', 'operator') ?? '',
      formula1: formula('formula1'),
      formula2: formula('formula2'),
      showErrorMessage: attributeOf(element, '', 'showErrorMessage') ?? '',
      errorStyle: attributeOf(element, '', 'errorStyle') ?? '',
      prompt: attributeOf(element, '', 'prompt') ?? '',
    };
    const check = checkOf(w);
    const shows = w.showErrorMessage === '1' || w.showErrorMessage === 'true';
    const std: StandardRule | null = check && {
      check,
      strict: shows && (w.errorStyle === '' || w.errorStyle === 'stop'),
      ...(w.prompt ? { help: w.prompt.slice(0, VALIDATION_HELP_MAX) } : {}),
    };
    const read = readValidation(std, fingerprintOf(w), bySqref.get(sqref.toUpperCase()));
    if (!read) continue;
    if (read.changed) out.changed.push({ r: ranges[0]!.r1, c: ranges[0]!.c1 });
    out.rules.push({ ...read.settings, ranges });
    out.read.add(element);
  }
  return out;
}
