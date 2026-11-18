// A formula in an ODF file's own syntax, OpenFormula (docs/specs/029-sheets/standard-mapping.md "Formulas in the
// file's own syntax"): `of:=SUM([.A1:.B2])`, other sheets as `[$'Sheet 2'.A1]`, `;` between arguments, inline arrays
// with `;` between columns and `|` between rows. People type Google's syntax; this file converts both ways, by text,
// so the formula keeps its words and spacing.
import { columnIndex, columnLetters } from '../address';
import type { A1Ref } from '../formula/ast';
import { refsOf } from '../formula/ast';
import { parseFormula } from '../formula/parse';
import { quoteSheet } from '../formula/stored';
import { tokenize, type Token } from '../formula/tokens';

/** The namespace prefix OpenFormula's formulas carry in `table:formula`. */
export const OPEN_FORMULA_PREFIX = 'of:';

// An open-ended range (`A2:A`) has no OpenFormula form: it reaches the last row or column LibreOffice's grid has.
export const OPEN_FORMULA_LAST_ROW = 1_048_576;
export const OPEN_FORMULA_LAST_COL = 16_384;

const LITERAL_BOOLEANS = new Set(['TRUE', 'FALSE']);

function ofSheetName(title: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(title) ? title : `'${title.replace(/'/g, "''")}'`;
}

function ofPart(
  r: number | undefined,
  c: number | undefined,
  absR: boolean,
  absC: boolean,
): string {
  const col = c === undefined ? '' : `${absC ? '$' : ''}${columnLetters(c)}`;
  const row = r === undefined ? '' : `${absR ? '$' : ''}${r + 1}`;
  return `${col}${row}`;
}

function ofReference(ref: A1Ref): string {
  const sheet = ref.sheet === undefined ? '.' : `$${ofSheetName(ref.sheet)}.`;
  const first = ofPart(ref.r1, ref.c1, !!(ref.a & 1), !!(ref.a & 2));
  const twoParts = ref.r2 !== undefined || ref.c2 !== undefined || ref.open !== undefined;
  if (!twoParts) return `[${sheet}${first}]`;
  // `A2:A` runs to the last row; `A2:2` to the last column.
  const r2 = ref.open === 'r' ? OPEN_FORMULA_LAST_ROW - 1 : ref.r2;
  const c2 = ref.open === 'c' ? OPEN_FORMULA_LAST_COL - 1 : ref.c2;
  return `[${sheet}${first}:.${ofPart(r2, c2, !!(ref.a & 4), !!(ref.a & 8))}]`;
}

function nextSolid(tokens: readonly Token[], from: number): Token | undefined {
  for (let i = from; i < tokens.length; i++) if (tokens[i]!.k !== 'ws') return tokens[i];
  return undefined;
}

/**
 * A formula as typed (`=SUM(A1:A2, 3)`) in OpenFormula, with its prefix (`of:=SUM([.A1:.A2]; 3)`); null when it
 * does not parse, or holds what OpenFormula cannot say (a spilled range's `#`).
 */
export function toOpenFormula(formula: string): string | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return null;
  const refs = refsOf(parsed.ast);
  if (refs.some((ref) => ref.spill)) return null;
  const body = formula.startsWith('=') ? 1 : 0;
  const tokens = tokenize(formula.slice(body), body);
  let out = `${OPEN_FORMULA_PREFIX}=`;
  let braces = 0;
  let refAt = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const ref = refs[refAt];
    if (ref && tok.start === ref.start) {
      out += ofReference(ref);
      refAt++;
      while (i + 1 < tokens.length && tokens[i + 1]!.start < ref.end) i++;
      continue;
    }
    if (tok.k === 'lbrace') braces++;
    if (tok.k === 'rbrace') braces--;
    if (tok.k === 'comma') out += ';';
    else if (tok.k === 'semi' && braces > 0) out += '|';
    else if (
      tok.k === 'ident' &&
      LITERAL_BOOLEANS.has(tok.v.toUpperCase()) &&
      nextSolid(tokens, i + 1)?.k !== 'lparen'
    )
      // OpenFormula has no boolean literal: TRUE() and FALSE() are its functions.
      out += `${tok.v}()`;
    else out += formula.slice(tok.start, tok.end);
  }
  return out;
}

type OfRefPart = { sheet?: string; col?: number; absCol: boolean; row?: number; absRow: boolean };

const OF_REF_PART = /^(?:\$?(?:'((?:[^']|'')*)'|([^.'[\]]+)))?\.(\$?)([A-Za-z]{0,3})(\$?)(\d*)$/;

function readOfRefPart(text: string): OfRefPart | null {
  const m = OF_REF_PART.exec(text);
  if (!m) return null;
  const [, quoted, plain, absCol, letters, absRow, digits] = m;
  if (!letters && !digits) return null;
  const sheet = quoted !== undefined ? quoted.replace(/''/g, "'") : plain;
  const part: OfRefPart = { absCol: absCol === '$', absRow: absRow === '$' };
  if (sheet !== undefined) part.sheet = sheet;
  if (letters) part.col = columnIndex(letters.toUpperCase());
  if (digits) part.row = Number(digits) - 1;
  return part;
}

// The parts of a reference's body split at its range colon, never at one inside a quoted sheet name.
function splitRange(body: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "'") quoted = !quoted;
    else if (body[i] === ':' && !quoted) {
      parts.push(body.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(body.slice(from));
  return parts;
}

function a1Part(part: OfRefPart): string {
  const col = part.col === undefined ? '' : `${part.absCol ? '$' : ''}${columnLetters(part.col)}`;
  const row = part.row === undefined ? '' : `${part.absRow ? '$' : ''}${part.row + 1}`;
  return `${col}${row}`;
}

function a1Reference(body: string): string | null {
  const texts = splitRange(body);
  if (texts.length > 2) return null;
  const parts = texts.map(readOfRefPart);
  if (parts.some((p) => p === null)) return null;
  const [first, second] = parts as OfRefPart[];
  // A range spanning two sheets has no Google form.
  if (second?.sheet !== undefined && second.sheet !== first!.sheet) return null;
  const prefix = first!.sheet === undefined ? '' : `${quoteSheet(first!.sheet)}!`;
  return `${prefix}${a1Part(first!)}${second ? `:${a1Part(second)}` : ''}`;
}

// Where a quoted run (a string, or a sheet name in a reference) that opens at `from` closes, past its doubled quotes.
function closingQuote(text: string, from: number, quote: string): number {
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] !== quote) continue;
    if (text[i + 1] === quote) i++;
    else return i;
  }
  return -1;
}

/**
 * An OpenFormula formula (`of:=SUM([.A1:.A2]; 3)`, the prefix optional) as Google's syntax (`=SUM(A1:A2, 3)`); null
 * when it is in another namespace or holds what this reader does not know.
 */
export function fromOpenFormula(formula: string): string | null {
  let text = formula;
  if (text.startsWith(OPEN_FORMULA_PREFIX)) text = text.slice(OPEN_FORMULA_PREFIX.length);
  else if (/^[a-z]+:=/.test(text)) return null;
  if (!text.startsWith('=')) return null;
  let out = '=';
  let braces = 0;
  for (let i = 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      const end = closingQuote(text, i, '"');
      if (end < 0) return null;
      out += text.slice(i, end + 1);
      i = end;
    } else if (ch === '[') {
      let end = i + 1;
      while (end < text.length && text[end] !== ']') {
        if (text[end] === "'") end = closingQuote(text, end, "'");
        if (end < 0) return null;
        end++;
      }
      const ref = a1Reference(text.slice(i + 1, end));
      if (ref === null) return null;
      out += ref;
      i = end;
    } else if (ch === '{') {
      braces++;
      out += ch;
    } else if (ch === '}') {
      braces--;
      out += ch;
    } else if (ch === ';') out += ',';
    else if (ch === '|' && braces > 0) out += ';';
    else if (/[A-Za-z]/.test(ch)) {
      const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(i))![0];
      const after = text.slice(i + word.length);
      // TRUE() and FALSE() read back as the literals Google writes.
      if (LITERAL_BOOLEANS.has(word.toUpperCase()) && /^\(\s*\)/.test(after)) {
        out += word;
        i += word.length - 1 + /^\(\s*\)/.exec(after)![0].length;
      } else {
        out += word;
        i += word.length - 1;
      }
    } else out += ch;
  }
  return out;
}
