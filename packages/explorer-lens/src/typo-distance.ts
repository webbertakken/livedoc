// How many typos lie between a query word and the start of a title word
// (docs/specs/013-workspace/explorer-filters.md): optimal string alignment, so swapping two neighbouring
// letters counts as one typo, as do an insert, a delete and a substitution.

/** The shortest query word a typo may forgive; shorter words match only as typed. */
export const TYPO_MIN_WORD_LENGTH = 4;
/** From this length a query word may carry two typos rather than one. */
export const TWO_TYPO_MIN_WORD_LENGTH = 8;
/** The longest title word start a typo is looked for in; the rest of a longer word is not read. */
export const TYPO_MAX_TARGET = 64;

/** The typos a query word of this length may carry. */
export function allowedTypos(wordLength: number): number {
  if (wordLength < TYPO_MIN_WORD_LENGTH) return 0;
  return wordLength < TWO_TYPO_MIN_WORD_LENGTH ? 1 : 2;
}

// Three rows of the table, reused by every call: matching runs on one thread and never re-enters.
const rows = [0, 1, 2].map(() => new Int32Array(TYPO_MAX_TARGET + 2));

/**
 * The fewest typos that turn `word` into a start of the title word `text[start, end)`, or null when
 * it takes more than `limit`; with the length of that start. A start more than `limit` letters
 * longer than the word is out of reach, and so is every cell more than `limit` off the diagonal, so
 * only that band is worked out (Ukkonen) and a row past `limit` ends the search.
 */
export function typoDistance(
  word: string,
  text: string,
  start: number,
  end: number,
  limit: number,
): { distance: number; length: number } | null {
  const columns = Math.min(end - start, word.length + limit, TYPO_MAX_TARGET) + 1;
  // A title word shorter than the word less its typos cannot hold it.
  if (columns - 1 < word.length - limit) return null;
  const outOfReach = limit + 1;
  let before = rows[0]!;
  let previous = rows[1]!;
  let current = rows[2]!;
  for (let j = 0; j < columns; j++) previous[j] = j;
  for (let i = 1; i <= word.length; i++) {
    const low = Math.max(1, i - limit);
    const high = Math.min(columns - 1, i + limit);
    current[0] = i;
    current[low - 1] = low === 1 ? i : outOfReach;
    current[high + 1] = outOfReach;
    let rowBest = i <= limit ? i : outOfReach;
    const letter = word.charCodeAt(i - 1);
    for (let j = low; j <= high; j++) {
      const target = text.charCodeAt(start + j - 1);
      let value = previous[j - 1]! + (letter === target ? 0 : 1);
      if (previous[j]! + 1 < value) value = previous[j]! + 1;
      if (current[j - 1]! + 1 < value) value = current[j - 1]! + 1;
      const swapped =
        i > 1 &&
        j > 1 &&
        letter === text.charCodeAt(start + j - 2) &&
        word.charCodeAt(i - 2) === target;
      if (swapped && before[j - 2]! + 1 < value) value = before[j - 2]! + 1;
      current[j] = value;
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > limit) return null;
    const spare = before;
    before = previous;
    previous = current;
    current = spare;
  }
  // The fewest typos; between equals, the start nearest the word's own length.
  let best: { distance: number; length: number } | null = null;
  for (let j = Math.max(0, word.length - limit); j < columns; j++) {
    const distance = previous[j]!;
    const nearer =
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        Math.abs(j - word.length) < Math.abs(best.length - word.length));
    if (distance <= limit && nearer) best = { distance, length: j };
  }
  return best;
}
