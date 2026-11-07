// A title folded once for matching (docs/specs/013-workspace/explorer-filters.md "Title
// matching"): lower case without accents, its words, and the way back to the title as written. Folding is
// the costly part of a match, so each title is folded once and kept.

/** How many folded titles the cache keeps before it starts over. */
export const TITLE_CACHE_LIMIT = 50_000;

/** A title folded once. `origin[i]` is where folded character `i` came from in the title as
 *  written, null when the two line up one to one (plain ASCII). */
export type FoldedTitle = {
  readonly folded: string;
  readonly wordStarts: readonly number[];
  readonly wordEnds: readonly number[];
  /** Each title word's letters as a set of bits (letterBit). */
  readonly wordLetters: readonly number[];
  readonly origin: readonly number[] | null;
  readonly length: number;
};

const MARKS = /\p{M}/gu;
const TITLE_WORD = /[\p{L}\p{N}]+/gu;

/** Lower case with accents stripped, so "Café" and "cafe" compare equal. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(MARKS, '').toLowerCase();
}

/** A character as one of 32 bits: a to z their own, every other character one of six shared. Two
 *  characters with different bits are surely different. */
export function letterBit(code: number): number {
  return 1 << (code >= 97 && code <= 122 ? code - 97 : 26 + (code % 6));
}

// A title that folds to its own length folded character for character: a letter loses only the marks its
// decomposition added (é to e), so offsets carry over. Any other length (a combining mark typed on its own,
// a Hangul syllable falling apart into its letters) is folded character by character to keep the way back.
function foldCharacters(title: string): { folded: string; origin: number[] | null } {
  const whole = foldText(title);
  if (whole.length === title.length) return { folded: whole, origin: null };
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const character of title) {
    const piece = foldText(character);
    folded += piece;
    for (let i = 0; i < piece.length; i++) origin.push(index);
    index += character.length;
  }
  return { folded, origin };
}

function foldTitle(title: string): FoldedTitle {
  const { folded, origin } = foldCharacters(title);
  const wordStarts: number[] = [];
  const wordEnds: number[] = [];
  const wordLetters: number[] = [];
  for (const word of folded.matchAll(TITLE_WORD)) {
    wordStarts.push(word.index);
    wordEnds.push(word.index + word[0].length);
    let letters = 0;
    for (let i = 0; i < word[0].length; i++) letters |= letterBit(word[0].charCodeAt(i));
    wordLetters.push(letters);
  }
  return { folded, wordStarts, wordEnds, wordLetters, origin, length: title.length };
}

const cache = new Map<string, FoldedTitle>();

/** The title folded, from the cache when it was folded before. */
export function foldedTitle(title: string): FoldedTitle {
  const hit = cache.get(title);
  if (hit) return hit;
  if (cache.size >= TITLE_CACHE_LIMIT) cache.clear();
  const made = foldTitle(title);
  cache.set(title, made);
  return made;
}

/** How many titles the cache holds (for tests). */
export function foldedTitleCount(): number {
  return cache.size;
}
