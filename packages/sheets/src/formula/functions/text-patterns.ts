// The patterns text functions search with: RE2 patterns (the REGEX functions), JavaScript ones (SEARCH's wildcards,
// QUERY), each under a work bound, since a regular expression cannot be interrupted once it runs.
import { RE2_CACHE_MAX, REGEX_BACKTRACK_MAX, REGEX_WORK_MAX } from '../../limits';
import { regexShape, regexWork } from '../regex-cost';
import { translateRe2, type Re2Pattern, type Re2Refusal } from '../re2/re2-translate';
import { err, type SheetError, type Value } from '../values';

// Whether a JavaScript `source` is too costly to run on `text`: the plain pass over it (sized by the pattern as
// written, `length`), and the backtracking its repeats allow (regex-cost.ts), which a short pattern can make run for
// minutes.
function tooCostly(source: string, length: number, text: string): SheetError | null {
  if (
    length * Math.max(1, text.length) > REGEX_WORK_MAX ||
    regexWork(regexShape(source), text.length) > REGEX_BACKTRACK_MAX
  )
    return err('#VALUE!', 'This pattern is too costly to run on this text');
  return null;
}

export function regex(pattern: string, text: string, flags = 'u'): RegExp | Value {
  const costly = tooCostly(pattern, pattern.length, text);
  if (costly) return costly;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return err('#VALUE!', `"${pattern}" is not a valid regular expression`);
  }
}

// Translations by pattern, oldest dropped past RE2_CACHE_MAX: a column of REGEX formulas shares a handful.
const translations = new Map<string, Re2Pattern | Re2Refusal>();

function translated(pattern: string): Re2Pattern | Re2Refusal {
  let t = translations.get(pattern);
  if (t) return t;
  t = translateRe2(pattern);
  if (translations.size >= RE2_CACHE_MAX) translations.delete(translations.keys().next().value!);
  translations.set(pattern, t);
  return t;
}

/** A REGEX function's RE2 pattern, compiled for `text` (global for REGEXREPLACE), or the error the cell shows: a
 *  pattern RE2 refuses is `#REF!` in Google's words. A fresh RegExp each call, so no state is shared. */
export function re2(
  fn: string,
  pattern: string,
  text: string,
  global = false,
): { re: RegExp; groups: number } | SheetError {
  const t = translated(pattern);
  if ('why' in t)
    return err(
      '#REF!',
      `Function ${fn} parameter 2 value "${pattern}" is not a valid regular expression.`,
    );
  return (
    tooCostly(t.source, pattern.length, text) ?? {
      re: new RegExp(t.source, global ? 'gu' : 'u'),
      groups: t.groups,
    }
  );
}

// A SEARCH pattern as a regular expression: * and ? are wildcards, ~ escapes them, everything else is literal.
export function wildcardSource(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '~' && i + 1 < pattern.length && '*?~'.includes(pattern[i + 1]!)) {
      const next = pattern[++i]!;
      out += next === '~' ? '~' : `\\${next}`;
    } else if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}
