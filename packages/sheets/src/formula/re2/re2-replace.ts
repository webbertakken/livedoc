// REGEXREPLACE's replacement text, in Google's own syntax (formulas.md "Text"): `$0` is the match, `$1` on its groups
// read as the longest number that still names a group (Java's rule: `$12` with fewer than 12 groups is group 1, then
// "2"); a `$` before no digit names no group, refused as Google refuses it; a backslash makes the next character
// plain; a backslash ending the text stays (default, D70). Pure.

/** Plain text, or the number of a group whose match goes there (0 for the whole match). */
export type ReplacementPart = string | number;

// The digit at `i`, or -1.
function digitAt(text: string, i: number): number {
  const d = text.charCodeAt(i) - 48;
  return d >= 0 && d <= 9 ? d : -1;
}

/** The replacement as parts, or the first group it names that the pattern lacks (null: a `$` before no digit). */
export function parseReplacement(
  text: string,
  groups: number,
): readonly ReplacementPart[] | { readonly missing: number | null } {
  const parts: ReplacementPart[] = [];
  let plain = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length) {
      plain += text[++i];
      continue;
    }
    const digit = digitAt(text, i + 1);
    if (ch !== '$') {
      plain += ch;
      continue;
    }
    if (digit < 0) return { missing: null };
    if (digit > groups) return { missing: digit };
    let n = digit;
    i += 1;
    for (
      let next = text.charCodeAt(i + 1) - 48;
      next >= 0 && next <= 9 && n * 10 + next <= groups;
    ) {
      n = n * 10 + next;
      i++;
      next = text.charCodeAt(i + 1) - 48;
    }
    if (plain) parts.push(plain);
    plain = '';
    parts.push(n);
  }
  if (plain) parts.push(plain);
  return parts;
}

/** The replacement for one match: `match[0]` the whole, `match[n]` group n, undefined for a group that took no part. */
export function applyReplacement(
  parts: readonly ReplacementPart[],
  match: readonly (string | undefined)[],
): string {
  let out = '';
  for (const part of parts) out += typeof part === 'string' ? part : (match[part] ?? '');
  return out;
}
