// How a term is matched on an event-storming board (docs/specs/021-event-storming/board-language.md "How a term is
// matched"): one rule for a reword's ripple and for Rename Term. Whole words, ignoring case; a plain plural matched
// and kept; a term of several words as a run; the replacement in the casing it replaces. Pure text, no model.

/** The longest term, characters (safe range: 20 to 120). */
export const TERM_MAX = 60;

// What a word is made of, in any script.
const WORD = '\\p{L}\\p{N}';

export function isValidTerm(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= TERM_MAX;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The term as it may stand in a text: its words as a run, an optional plural `s`, no word character either side.
function patternOf(term: string): RegExp | null {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(`(?<![${WORD}])(${words.map(escaped).join('\\s+')})(s?)(?![${WORD}])`, 'giu');
}

const isLower = (s: string) => s === s.toLowerCase() && s !== s.toUpperCase();
const isUpper = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();

// The new term in the casing of the run it replaces: lower case, UPPER CASE or Capitalised; else as typed.
function recased(to: string, matched: string): string {
  if (isLower(matched)) return to.toLowerCase();
  // One capital letter is a Capitalised word, not a shouted one.
  if ((matched.match(/\p{L}/gu) ?? []).length > 1 && isUpper(matched)) return to.toUpperCase();
  const [first = '', ...rest] = [...matched];
  if (isUpper(first) && isLower(rest.join('') || 'a')) {
    const [head = '', ...tail] = [...to];
    return head.toUpperCase() + tail.join('');
  }
  return to;
}

/** Whether `text` holds `term`, as `replaceTerm` would match it. */
export function holdsTerm(text: string, term: string): boolean {
  return patternOf(term)?.test(text) ?? false;
}

/** `text` with every match of `from` replaced by `to`; the text itself when nothing would change. */
export function replaceTerm(text: string, from: string, to: string): string {
  const pattern = patternOf(from);
  const next = to.trim();
  if (!pattern || !next || next.toLowerCase() === from.trim().toLowerCase()) return text;
  return text.replace(pattern, (_all, matched: string, plural: string) => {
    return recased(next, matched) + plural;
  });
}
