// The patterns text functions search with: regular expressions under a work bound, and SEARCH's wildcards.
import { REGEX_BACKTRACK_MAX, REGEX_WORK_MAX } from '../../limits';
import { regexShape, regexWork } from '../regex-cost';
import { err, type Value } from '../values';

export function regex(pattern: string, text: string, flags = 'u'): RegExp | Value {
  // Two bounds: the plain pass over the text, and the backtracking the pattern's repeats allow (regex-cost.ts), which
  // a pattern only a few characters long can make run for minutes.
  if (
    pattern.length * Math.max(1, text.length) > REGEX_WORK_MAX ||
    regexWork(regexShape(pattern), text.length) > REGEX_BACKTRACK_MAX
  )
    return err('#VALUE!', 'This pattern is too costly to run on this text');
  try {
    return new RegExp(pattern, flags);
  } catch {
    return err('#VALUE!', `"${pattern}" is not a valid regular expression`);
  }
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
