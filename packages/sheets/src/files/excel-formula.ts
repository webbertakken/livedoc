// A formula in an XLSX file's own syntax, Excel's grammar (docs/specs/029-sheets/standard-mapping.md "Excel's grammar
// in detail"): Google's syntax with Excel's prefixes on later functions and LAMBDA's parameters, a spill as
// `ANCHORARRAY`, and open-ended ranges closed. What Excel cannot hold is written whole by S5's convention, as Google
// Sheets writes it (`IFERROR(__xludf.DUMMYFUNCTION("…"), <cached>)`), and read back as the formula it wraps.
import { callsOf, childrenOf, refsOf, type Node } from '../formula/ast';
import { parseFormula } from '../formula/parse';
import { tokenize, type Token } from '../formula/tokens';
import { formatExcelTableRef, parseTableRef } from '../tables/table-ref';
import { a1Text, FILE_LAST_COL } from './a1-text';
import { reopenRanges } from './formula-text-shift';
import {
  googleNameOfXlsx,
  XLSX_FUTURE_PREFIX,
  XLSX_PARAMETER_PREFIX,
  xlsxFunctionName,
  xlsxLacks,
} from './xlsx-function-names';

const ANCHOR_ARRAY = `${XLSX_FUTURE_PREFIX}ANCHORARRAY`;

// An array literal Excel holds: constants only, a minus allowed before a number.
function isConstant(node: Node): boolean {
  if (node.k === 'neg') return node.a.k === 'num';
  return node.k === 'num' || node.k === 'str' || node.k === 'bool' || node.k === 'err';
}

function holdsNonConstantArray(node: Node): boolean {
  if (node.k === 'arr' && !node.rows.flat().every(isConstant)) return true;
  return childrenOf(node).some(holdsNonConstantArray);
}

// The names LAMBDA and LET bind (every LAMBDA argument but its body; every other LET argument but its last).
function parametersOf(node: Node, out: Set<string>): Set<string> {
  if (node.k === 'call' && (node.name === 'LAMBDA' || node.name === 'LET')) {
    const last = node.args.length - 1;
    node.args.forEach((arg, i) => {
      const binds = node.name === 'LAMBDA' ? i < last : i < last && i % 2 === 0;
      if (binds && arg?.k === 'name') out.add(arg.v);
    });
  }
  for (const child of childrenOf(node)) parametersOf(child, out);
  return out;
}

function nextSolid(tokens: readonly Token[], from: number): Token | undefined {
  for (let i = from; i < tokens.length; i++) if (tokens[i]!.k !== 'ws') return tokens[i];
  return undefined;
}

/**
 * A formula as typed (`=SEQUENCE(3)`) in Excel's grammar, without its `=` (`_xlfn.SEQUENCE(3)`), its sheet names
 * as `renamed` maps them; null when Excel's grammar cannot hold it (it does not parse, calls a function Excel lacks,
 * holds an array literal of more than constants (D83), or names a column past `XFD` (D89)): such a formula is
 * written by `dummyFunction`. A table reference is written in Excel's file form, a name of `tables` (the workbook's
 * tables' formula names, upper case) alone as the whole table's (standard-mapping.md "Tables in the file").
 */
export function toExcelFormula(
  formula: string,
  renamed: ReadonlyMap<string, string> = new Map(),
  tables: ReadonlySet<string> = new Set(),
): string | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return null;
  if ([...callsOf(parsed.ast)].some(xlsxLacks) || holdsNonConstantArray(parsed.ast)) return null;
  const refs = refsOf(parsed.ast);
  if (refs.some((ref) => Math.max(ref.c1 ?? 0, ref.c2 ?? 0) >= FILE_LAST_COL)) return null;
  const parameters = parametersOf(parsed.ast, new Set());
  const body = formula.startsWith('=') ? 1 : 0;
  const tokens = tokenize(formula.slice(body), body);
  let out = '';
  let refAt = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const ref = refs[refAt];
    if (ref && tok.start === ref.start) {
      const sheet = ref.sheet === undefined ? undefined : (renamed.get(ref.sheet) ?? ref.sheet);
      const text = a1Text({ ...ref, ...(sheet === undefined ? {} : { sheet }) }, true);
      out += ref.spill ? `${ANCHOR_ARRAY}(${text})` : text;
      refAt++;
      while (i + 1 < tokens.length && tokens[i + 1]!.start < ref.end) i++;
      continue;
    }
    const called = tok.k === 'ident' && nextSolid(tokens, i + 1)?.k === 'lparen';
    if (tok.k === 'ident' && parameters.has(tok.v.toUpperCase()))
      out += `${XLSX_PARAMETER_PREFIX}${tok.v}`;
    else if (called) out += xlsxFunctionName(tok.v);
    else if (tok.k === 'ident' && tables.has(tok.v.toUpperCase())) out += `${tok.v}[]`;
    else if (tok.k === 'table') out += excelTableRef(tok.v);
    // Excel holds 255 characters a string literal: a longer one is joined from pieces, bracketed as one value.
    else if (tok.k === 'str' && tok.v.length > EXCEL_STRING_LITERAL_MAX)
      out += `(${stringLiterals(tok.v)})`;
    else out += formula.slice(tok.start, tok.end);
  }
  return out;
}

// A table reference as Excel's file writes it; one naming no table (`[@Amount]` inside it) as typed.
function excelTableRef(text: string): string {
  const spec = parseTableRef(text);
  return spec?.table ? formatExcelTableRef(spec.table, spec.cols, spec.area) : text;
}

/** A cached value as an Excel literal, for S5's wrapping: a number, a quoted text, a boolean, or an error. */
export type CachedLiteral = number | string | boolean | { e: string };

function literal(cached: CachedLiteral | undefined): string {
  if (cached === undefined) return '""';
  if (typeof cached === 'number') return String(cached);
  if (typeof cached === 'boolean') return cached ? 'TRUE' : 'FALSE';
  if (typeof cached === 'string') return `"${cached.replace(/"/g, '""')}"`;
  return cached.e;
}

/** The most characters an Excel formula's string literal holds (ECMA-376 Part 1, §18.17.2.4 "str"). */
export const EXCEL_STRING_LITERAL_MAX = 255;

// A text as Excel string literals: one, or several joined by `&` past 255 characters, as Google Sheets writes them.
function stringLiterals(text: string): string {
  const pieces: string[] = [];
  for (let at = 0; at < text.length || pieces.length === 0; at += EXCEL_STRING_LITERAL_MAX)
    pieces.push(`"${text.slice(at, at + EXCEL_STRING_LITERAL_MAX).replace(/"/g, '""')}"`);
  return pieces.join('&');
}

/** S5's convention in XLSX: the whole formula kept as text, Excel shown the value it last gave. */
export function dummyFunction(formula: string, cached: CachedLiteral | undefined): string {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  return `IFERROR(__xludf.DUMMYFUNCTION(${stringLiterals(text)}),${literal(cached)})`;
}

// The wrapped text: one string literal, or several joined by `&` (Google's past 255 characters, measured 2026-11-22).
const DUMMY =
  /^\s*IFERROR\(\s*__xludf\.DUMMYFUNCTION\(\s*((?:"(?:[^"]|"")*"\s*&\s*)*"(?:[^"]|"")*")\s*\)\s*,/i;
const LITERAL = /"((?:[^"]|"")*)"/g;

/** The formula S5's convention wraps, as typed (`=QUERY(…)`); null when the text is not that convention. */
export function unwrapDummyFunction(text: string): string | null {
  const m = DUMMY.exec(text);
  if (!m) return null;
  const pieces = [...m[1]!.matchAll(LITERAL)].map((piece) => piece[1]!.replace(/""/g, '"'));
  return `=${pieces.join('')}`;
}

// The text between a function's brackets, from the token after its name; null when they never close.
function argumentsText(
  tokens: readonly Token[],
  from: number,
  text: string,
): { inner: string; last: number } | null {
  let depth = 0;
  let open = -1;
  for (let i = from; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.k === 'lparen' && depth++ === 0) open = i;
    if (tok.k === 'rparen' && --depth === 0)
      return { inner: text.slice(tokens[open]!.end, tok.start).trim(), last: i };
  }
  return null;
}

/**
 * An XLSX file's formula (`_xlfn.SEQUENCE(3)`, without `=`) in Google's syntax (`=SEQUENCE(3)`); null when it holds
 * what Google's cannot say (a spill of anything but a reference).
 */
export function fromExcelFormula(text: string): string | null {
  const wrapped = unwrapDummyFunction(text);
  if (wrapped !== null) return wrapped;
  const tokens = tokenize(text);
  let out = '=';
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const word = tok.k === 'ident' ? tok.v : '';
    if (word.toUpperCase() === ANCHOR_ARRAY.toUpperCase()) {
      const args = argumentsText(tokens, i + 1, text);
      const ref = args && parseFormula(`=${args.inner}`);
      if (!args || !ref?.ok || ref.ast.k !== 'ref') return null;
      out += `${args.inner}#`;
      i = args.last;
    } else if (word.toLowerCase().startsWith(XLSX_PARAMETER_PREFIX))
      out += word.slice(XLSX_PARAMETER_PREFIX.length);
    else if (word && nextSolid(tokens, i + 1)?.k === 'lparen') out += googleNameOfXlsx(word);
    else out += text.slice(tok.start, tok.end);
  }
  return reopenRanges(out);
}
