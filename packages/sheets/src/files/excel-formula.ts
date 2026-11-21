// A formula in an XLSX file's own syntax, Excel's grammar (docs/specs/029-sheets/standard-mapping.md "Excel's grammar
// in detail"): Google's syntax with Excel's prefixes on later functions and LAMBDA's parameters, a spill as
// `ANCHORARRAY`, and open-ended ranges closed. What Excel cannot hold is written whole by S5's convention, as Google
// Sheets writes it (`IFERROR(__xludf.DUMMYFUNCTION("…"), <cached>)`), and read back as the formula it wraps.
import { callsOf, childrenOf, refsOf, type Node } from '../formula/ast';
import { parseFormula } from '../formula/parse';
import { tokenize, type Token } from '../formula/tokens';
import { a1Text } from './a1-text';
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
 * or holds an array literal of more than constants): such a formula is written by `dummyFunction` (D83).
 */
export function toExcelFormula(
  formula: string,
  renamed: ReadonlyMap<string, string> = new Map(),
): string | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return null;
  if ([...callsOf(parsed.ast)].some(xlsxLacks) || holdsNonConstantArray(parsed.ast)) return null;
  const refs = refsOf(parsed.ast);
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
    else out += formula.slice(tok.start, tok.end);
  }
  return out;
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

/** S5's convention in XLSX: the whole formula kept as text, Excel shown the value it last gave. */
export function dummyFunction(formula: string, cached: CachedLiteral | undefined): string {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  return `IFERROR(__xludf.DUMMYFUNCTION("${text.replace(/"/g, '""')}"),${literal(cached)})`;
}

const DUMMY = /^\s*IFERROR\(\s*__xludf\.DUMMYFUNCTION\(\s*"((?:[^"]|"")*)"\s*\)\s*,/i;

/** The formula S5's convention wraps, as typed (`=QUERY(…)`); null when the text is not that convention. */
export function unwrapDummyFunction(text: string): string | null {
  const m = DUMMY.exec(text);
  return m ? `=${m[1]!.replace(/""/g, '"')}` : null;
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
  return out;
}
