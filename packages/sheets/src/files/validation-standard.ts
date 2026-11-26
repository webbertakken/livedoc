// A validation rule's two forms in a file (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D289 to
// D292): the standard rule closest to it, which every app checks, and LiveDoc's rule beside it, exact, read back only
// while the standard rule's fingerprint is the one LiveDoc wrote. Format-neutral: each format maps a standard rule to
// its own XML and names the lines its fingerprint is taken over.
import { crc32 } from '@livedoc/office-packages';
import type { DateOp, NumOp } from '../sheet';
import type { FileValidationSettings } from './file-validation';

/** What a standard rule checks: a list of values, a range's values, a number or date, a formula, or anything. */
export type StandardCheck =
  | { k: 'list'; items: string[] }
  | { k: 'range'; src: string }
  | { k: 'num' | 'date'; op: NumOp; a: number; b?: number }
  // Google's syntax, written for the rule's top-left cell.
  | { k: 'formula'; fx: string }
  | { k: 'any' };

/** A standard rule: its check, whether it refuses a value it does not allow, and its input message. */
export type StandardRule = { check: StandardCheck; strict: boolean; help?: string };

/** LiveDoc's namespace in either format: an XLSX `ext`'s `uri` and ODF's `livedoc:` attributes. */
export const LIVEDOC_SPREADSHEET_NS = 'urn:livedoc:xmlns:spreadsheet:1.0';

const DATE_AS_NUM: Readonly<Partial<Record<DateOp, NumOp>>> = {
  before: 'lt',
  onOrBefore: 'lte',
  after: 'gt',
  onOrAfter: 'gte',
  on: 'eq',
  between: 'between',
  notBetween: 'notBetween',
};
const NUM_AS_DATE: Readonly<Partial<Record<NumOp, DateOp>>> = Object.fromEntries(
  Object.entries(DATE_AS_NUM).map(([date, num]) => [num, date]),
);

const text = (s: string) => `"${s.replace(/"/g, '""')}"`;

// Google's own formula for a valid date, as its export writes it.
const validDate = (at: string) =>
  `=OR(NOT(ISERROR(DATEVALUE(${at}))),AND(ISNUMBER(${at}),LEFT(CELL("format",${at}))="D"))`;

function textCheck(op: FileValidationSettings['op'], a: string, at: string): string {
  switch (op) {
    case 'contains':
      return `=NOT(ISERROR(SEARCH(${text(a)},${at})))`;
    case 'notContains':
      return `=ISERROR(SEARCH(${text(a)},${at}))`;
    // Equal text compares case aside in every app, as LiveDoc checks it.
    case 'exactly':
      return `=${at}=${text(a)}`;
    case 'email':
      return `=IFERROR(ISEMAIL(${at}),TRUE)`;
    default:
      return `=IFERROR(ISURL(${at}),TRUE)`;
  }
}

function checkOf(rule: FileValidationSettings, at: string): StandardCheck {
  const operands = { a: Number(rule.a), ...(rule.b === undefined ? {} : { b: rule.b }) };
  switch (rule.is) {
    case 'list':
      return { k: 'list', items: (rule.opts ?? []).map((o) => o.v) };
    case 'range':
      return rule.src === undefined ? { k: 'any' } : { k: 'range', src: rule.src };
    case 'check':
      return rule.on === undefined
        ? { k: 'list', items: ['TRUE', 'FALSE'] }
        : {
            k: 'list',
            items: [rule.on, ...(rule.off === undefined ? [] : [rule.off])].map(String),
          };
    case 'num':
      return { k: 'num', op: rule.op as NumOp, ...operands };
    case 'date':
      return rule.op === 'valid'
        ? { k: 'formula', fx: validDate(at) }
        : { k: 'date', op: DATE_AS_NUM[rule.op as DateOp]!, ...operands };
    case 'text':
      return { k: 'formula', fx: textCheck(rule.op, String(rule.a ?? ''), at) };
    case 'formula':
      return rule.fx === undefined ? { k: 'any' } : { k: 'formula', fx: rule.fx };
  }
}

/** The standard rule closest to a rule whose top-left cell is `at` (`B2`). */
export function standardRuleOf(rule: FileValidationSettings, at: string): StandardRule {
  return {
    check: checkOf(rule, at),
    strict: !rule.warn,
    ...(rule.help === undefined ? {} : { help: rule.help }),
  };
}

/** A standard rule read as LiveDoc's closest rule (D292); null for one that allows anything. */
export function settingsFromStandard(std: StandardRule): FileValidationSettings | null {
  const base = {
    ...(std.strict ? {} : { warn: true as const }),
    ...(std.help ? { help: std.help } : {}),
  };
  const { check } = std;
  switch (check.k) {
    case 'list':
      return { is: 'list', opts: check.items.map((v) => ({ v })), ...base };
    case 'range':
      return { is: 'range', src: check.src, ...base };
    case 'formula':
      return { is: 'formula', fx: check.fx, ...base };
    case 'num':
    case 'date': {
      const op = check.k === 'num' ? check.op : NUM_AS_DATE[check.op];
      if (op === undefined) return null;
      const b = check.b === undefined ? {} : { b: check.b };
      return { is: check.k, op, a: check.a, ...b, ...base };
    }
    case 'any':
      return null;
  }
}

/** LiveDoc's rule as its attribute holds it: the rule's settings as JSON. */
export const liveDocRuleText = (settings: FileValidationSettings): string =>
  JSON.stringify(settings);

/** LiveDoc's rule read from its attribute; null when it is not a JSON object (the rule's shape is checked later). */
export function liveDocRuleFrom(json: string): FileValidationSettings | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FileValidationSettings)
      : null;
  } catch {
    return null;
  }
}

/** A standard rule's fingerprint: the CRC-32 of its lines as written, 8 lower-case hex digits (D290). */
export function validationFingerprint(lines: readonly string[]): string {
  return crc32(new TextEncoder().encode(lines.join('\n')))
    .toString(16)
    .padStart(8, '0');
}

/** LiveDoc's rule beside a standard rule, as a file holds it. */
export type LiveDocRuleAttributes = { rule: string; fingerprint: string | undefined };

/** How a rule was read: LiveDoc's own, the standard rule's, or the standard rule's over LiveDoc's changed one. */
export type ValidationRead = { settings: FileValidationSettings; changed: boolean } | null;

/**
 * A rule as read: LiveDoc's when its fingerprint is the standard rule's as read (`fingerprint`), else the standard
 * rule's, `changed` when LiveDoc's was there (D290); null when neither can be read, so the file keeps it.
 */
export function readValidation(
  std: StandardRule | null,
  fingerprint: string,
  liveDoc: LiveDocRuleAttributes | undefined,
): ValidationRead {
  const own = liveDoc && liveDoc.fingerprint === fingerprint ? liveDocRuleFrom(liveDoc.rule) : null;
  if (own) return { settings: own, changed: false };
  const settings = std && settingsFromStandard(std);
  return settings ? { settings, changed: liveDoc !== undefined } : null;
}
