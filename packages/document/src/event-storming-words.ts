// How two pieces of board text are compared (docs/specs/021-event-storming/board-reading.md "Gaps",
// docs/specs/021-event-storming/asks.md "What was declined"): case, punctuation and repeated spaces never tell two
// notes apart. One rule for the reading's duplicates, a duplicate suggestion and what was declined.

/** `words` as they compare: lower case, letters, digits and single spaces only. */
export function comparableWords(words: string): string {
  return words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two texts that say the same, as `comparableWords` reads them. */
export function sameWords(a: string, b: string): boolean {
  return comparableWords(a) === comparableWords(b);
}
