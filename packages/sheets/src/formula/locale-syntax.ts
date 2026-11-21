// A formula as a locale writes it (docs/specs/029-sheets/formulas.md "Locale"): where decimals take a comma, arguments
// are split by `;` and an array's columns by `\`, and `1.5` is `1,5`. Formulas are stored in the one syntax with points
// and commas; these two turn typed text into it and stored text back. Reading typed text keeps every character in its
// place (each swap is one character for one), so a refusal's offset and the editor's reference colours stay true.
import { localeSeparators } from '../input';

/** `point`: decimals `1.5`, `,` between arguments and columns. `comma`: decimals `1,5`, `;` and `\` (D78). */
export type FormulaSyntax = 'point' | 'comma';

export type LocaleFormulaRead = { ok: true; text: string } | { ok: false; at: number };

/** The syntax a locale writes formulas in: by its own decimal mark. */
export function formulaSyntaxOf(locale: string): FormulaSyntax {
  return localeSeparators(locale).decimal === ',' ? 'comma' : 'point';
}

/** The locale's separator between arguments, as the hints write it. */
export function argumentSeparatorOf(syntax: FormulaSyntax): ',' | ';' {
  return syntax === 'comma' ? ';' : ',';
}

type Bracket = '(' | '{';
const WORD_START = /[A-Za-z_$]/;
const WORD = /[A-Za-z0-9_.$]/;
const DIGIT = /[0-9]/;

// Where a number starting at i ends: digits, one decimal mark and digits (the stored syntax also allows none after
// it, and none before it), an exponent.
function numberEnd(text: string, i: number, decimal: '.' | ','): number {
  let j = i;
  while (DIGIT.test(text[j] ?? '')) j++;
  if (text[j] === decimal && (decimal === '.' || DIGIT.test(text[j + 1] ?? ''))) {
    j++;
    while (DIGIT.test(text[j] ?? '')) j++;
  }
  if (/[eE]/.test(text[j] ?? '') && /^[+-]?[0-9]/.test(text.slice(j + 1, j + 3))) {
    j += /[+-]/.test(text[j + 1]!) ? 2 : 1;
    while (DIGIT.test(text[j] ?? '')) j++;
  }
  return j;
}

// What a walk wrote, and where it stopped (null: it went to the end).
type Walked = { text: string; stopped: number | null };

// Walks a formula's text: each number whole to `number`, each other character not inside quotes to `char` with the
// bracket it sits in; quoted text, quoted sheet names and words pass untouched. `char` gives the text to keep, or
// null to stop there.
function walk(
  text: string,
  decimal: '.' | ',',
  char: (ch: string, inside: Bracket | undefined) => string | null,
  number: (digits: string) => string,
): Walked {
  const open: Bracket[] = [];
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    let j = i + 1;
    if (ch === '"' || ch === "'") {
      while (j < text.length && !(text[j] === ch && text[j + 1] !== ch))
        j += text[j] === ch ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (WORD_START.test(ch)) {
      // A word (a function, a reference, a name): its digits and points are never a number's.
      while (j < text.length && WORD.test(text[j]!)) j++;
      out += text.slice(i, j);
    } else if (DIGIT.test(ch) || (decimal === '.' && ch === '.' && DIGIT.test(text[j] ?? ''))) {
      j = numberEnd(text, i, decimal);
      out += number(text.slice(i, j));
    } else {
      if (ch === '(' || ch === '{') open.push(ch);
      else if (ch === ')' || ch === '}') open.pop();
      const kept = char(ch, open.at(-1));
      if (kept === null) return { text: out, stopped: i };
      out += kept;
    }
    i = j;
  }
  return { text: out, stopped: null };
}

/**
 * Typed text (`=…`) in the locale's syntax as the stored syntax, every character in its place; a refusal where the
 * locale's syntax cannot read it: a comma outside a number, a point.
 */
export function formulaFromLocale(text: string, syntax: FormulaSyntax): LocaleFormulaRead {
  if (syntax === 'point') return { ok: true, text };
  const read = walk(
    text,
    ',',
    (ch, inside) => {
      if (ch === ',' || ch === '.') return null;
      if (ch === ';' && inside === '(') return ',';
      if (ch === '\\' && inside === '{') return ',';
      return ch;
    },
    (digits) => digits.replace(',', '.'),
  );
  return read.stopped === null ? { ok: true, text: read.text } : { ok: false, at: read.stopped };
}

/** Stored text (`=…`) as the locale writes it. */
export function formulaToLocale(text: string, syntax: FormulaSyntax): string {
  if (syntax === 'point') return text;
  return walk(
    text,
    '.',
    (ch, inside) => {
      if (ch === ',' && inside === '(') return ';';
      if (ch === ',' && inside === '{') return '\\';
      return ch;
    },
    // `.5` and `1.` (the stored syntax allows both) as `0,5` and `1`, so they read back.
    (digits) =>
      digits
        .replace(/^\./, '0.')
        .replace(/\.(?![0-9])/, '')
        .replace('.', ','),
  ).text;
}
