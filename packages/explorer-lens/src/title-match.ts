// Fuzzy title matching (docs/specs/013-workspace/explorer-filters.md "Matching",
// docs/specs/013-workspace/explorer-filters.md). One matcher for every list of
// document titles: the Explorer lens, the search panel's documents and Add to Document.
//
// Every query word must match the title, by the best of four tiers: a substring, the starts of successive
// title words, letters in order (initials first), then a typo. A title's score is the sum of its words'
// scores, lower first.

import { foldText, foldedTitle, letterBit, type FoldedTitle } from './title-fold';
import { allowedTypos, typoDistance } from './typo-distance';

/** How a query word matched, best first; a tier's index is the score it starts from. */
export const TITLE_MATCH_TIERS = ['substring', 'word-prefixes', 'subsequence', 'typo'] as const;
export type TitleMatchTier = (typeof TITLE_MATCH_TIERS)[number];

/** The fewest letters a title word's start gives in the word-prefixes tier. */
export const WORD_PREFIX_MIN_LENGTH = 2;
/** How far the weaker match of a tier drops: a substring inside a title word, letters in order
 *  that are not initials, a second typo. Less than the step between two tiers. */
export const TITLE_TIER_STEP_DOWN = 0.5;

const SUBSTRING = 0;
const WORD_PREFIXES = 1;
const SUBSEQUENCE = 2;
const TYPO = 3;

/** A half-open range of UTF-16 offsets into the title as written. */
export type TitleRange = { start: number; end: number };

/** How well a title matches every query word: `score` is lower for better (0: every word found
 *  where a title word starts), `ranges` the matched characters, merged and in order. */
export type TitleMatch = { score: number; ranges: readonly TitleRange[] };

/** A query word compiled once: folded, the typos it may carry, and each letter's bit (letterBit). */
type QueryWord = {
  readonly text: string;
  readonly typos: number;
  readonly bits: readonly number[];
};

/** A query compiled once into its folded words. */
export type TitleQuery = { readonly words: readonly QueryWord[] };

/** Where matched characters go, as offsets into the folded title; null when only the score counts. */
type Collector = number[] | null;

const QUERY_SEPARATOR = /[^\p{L}\p{N}]+/u;

/** The query's words, folded and split wherever a character is no letter or digit, so "q3-plan"
 *  reads as "q3" and "plan", as a title's words do. */
export function compileTitleQuery(words: readonly string[]): TitleQuery {
  return {
    words: words
      .flatMap((word) => foldText(word).split(QUERY_SEPARATOR))
      .filter(Boolean)
      .map((text) => ({
        text,
        typos: allowedTypos(text.length),
        bits: Array.from(text, (character) => letterBit(character.charCodeAt(0))),
      })),
  };
}

function collect(into: Collector, from: number, length: number): void {
  if (into) for (let i = 0; i < length; i++) into.push(from + i);
}

/** The word as typed: where a title word starts, else inside one. */
function substring(word: string, title: FoldedTitle, into: Collector): number | null {
  const anywhere = title.folded.indexOf(word);
  if (anywhere === -1) return null;
  for (const start of title.wordStarts) {
    if (title.folded.startsWith(word, start)) {
      collect(into, start, word.length);
      return SUBSTRING;
    }
  }
  collect(into, anywhere, word.length);
  return SUBSTRING + TITLE_TIER_STEP_DOWN;
}

/** The word spelled by the starts of successive title words, each at least WORD_PREFIX_MIN_LENGTH
 *  letters: "meetnot" in "Meeting notes". Title words may be skipped; the earliest spelling wins. */
function wordPrefixes(word: string, title: FoldedTitle, into: Collector): number | null {
  const { folded: text, wordStarts, wordEnds } = title;
  if (!startsSomeWord(word, title, WORD_PREFIX_MIN_LENGTH)) return null;
  let dead: Set<number> | null = null;
  const spell = (from: number, wordIndex: number): boolean => {
    if (from === word.length) return true;
    const state = from * (wordStarts.length + 1) + wordIndex;
    if (dead?.has(state)) return false;
    for (let w = wordIndex; w < wordStarts.length; w++) {
      const start = wordStarts[w]!;
      const room = Math.min(wordEnds[w]! - start, word.length - from);
      let common = 0;
      while (common < room && text.charCodeAt(start + common) === word.charCodeAt(from + common))
        common++;
      for (let take = common; take >= WORD_PREFIX_MIN_LENGTH; take--) {
        if (spell(from + take, w + 1)) {
          collect(into, start, take);
          return true;
        }
      }
    }
    (dead ??= new Set()).add(state);
    return false;
  };
  return spell(0, 0) ? WORD_PREFIXES : null;
}

/** Whether a title word starts with the word's first `length` letters: a cheap test before a costly one. */
function startsSomeWord(word: string, title: FoldedTitle, length: number): boolean {
  const { folded: text, wordStarts, wordEnds } = title;
  if (word.length < length) return false;
  for (let w = 0; w < wordStarts.length; w++) {
    const start = wordStarts[w]!;
    if (wordEnds[w]! - start < length) continue;
    let same = 0;
    while (same < length && text.charCodeAt(start + same) === word.charCodeAt(same)) same++;
    if (same === length) return true;
  }
  return false;
}

/** The word's letters in order within `text[start, end)`, the first at `start`; their offsets go
 *  into the collector. */
function lettersInOrder(
  word: string,
  text: string,
  start: number,
  end: number,
  into: Collector,
): boolean {
  if (text.charCodeAt(start) !== word.charCodeAt(0)) return false;
  let at = start + 1;
  for (let i = 1; i < word.length; i++) {
    while (at < end && text.charCodeAt(at) !== word.charCodeAt(i)) at++;
    if (at === end) return false;
    at++;
  }
  if (into) {
    into.push(start);
    at = start + 1;
    for (let i = 1; i < word.length; i++) {
      while (text.charCodeAt(at) !== word.charCodeAt(i)) at++;
      into.push(at++);
    }
  }
  return true;
}

/** The word's letters in order: the initials of successive title words ("mn" in "Meeting notes"),
 *  else within one title word from its first letter ("mtg" in "Meeting"). */
function subsequence(word: string, title: FoldedTitle, into: Collector): number | null {
  const { folded: text, wordStarts, wordEnds } = title;
  let initials = 0;
  for (let w = 0; w < wordStarts.length && initials < word.length; w++) {
    if (text.charCodeAt(wordStarts[w]!) === word.charCodeAt(initials)) initials++;
  }
  if (initials === word.length) {
    if (into) {
      let next = 0;
      for (const start of wordStarts) {
        if (next < word.length && text.charCodeAt(start) === word.charCodeAt(next)) {
          into.push(start);
          next++;
        }
      }
    }
    return SUBSEQUENCE;
  }
  for (let w = 0; w < wordStarts.length; w++) {
    if (lettersInOrder(word, text, wordStarts[w]!, wordEnds[w]!, into))
      return SUBSEQUENCE + TITLE_TIER_STEP_DOWN;
  }
  return null;
}

/** The word, mistyped, at the start of a title word: "meetnig" in "Meeting notes". The fewest
 *  typos win; then the earliest title word. */
function typo(word: QueryWord, title: FoldedTitle, into: Collector): number | null {
  if (word.typos === 0) return null;
  let best: { distance: number; start: number; length: number } | null = null;
  for (let w = 0; w < title.wordStarts.length; w++) {
    // Each of the word's letters the title word lacks costs a typo: past the limit, no table is needed.
    const letters = title.wordLetters[w]!;
    let lacking = 0;
    for (let i = 0; i < word.bits.length; i++) if ((letters & word.bits[i]!) === 0) lacking++;
    if (lacking > word.typos) continue;
    const start = title.wordStarts[w]!;
    const found = typoDistance(word.text, title.folded, start, title.wordEnds[w]!, word.typos);
    if (found && (best === null || found.distance < best.distance))
      best = { distance: found.distance, start, length: found.length };
  }
  if (best === null) return null;
  collect(into, best.start, best.length);
  return TYPO + (best.distance - 1) * TITLE_TIER_STEP_DOWN;
}

function matchWord(word: QueryWord, title: FoldedTitle, into: Collector): number | null {
  return (
    substring(word.text, title, into) ??
    wordPrefixes(word.text, title, into) ??
    subsequence(word.text, title, into) ??
    typo(word, title, into)
  );
}

function scoreFolded(query: TitleQuery, title: FoldedTitle, into: Collector): number | null {
  let score = 0;
  for (const word of query.words) {
    const found = matchWord(word, title, into);
    if (found === null) return null;
    score += found;
  }
  return score;
}

/** How well a title matches a compiled query, lower first, or null when any word misses. A query
 *  with no words scores every title 0. The hot path: it records no ranges. */
export function scoreTitle(query: TitleQuery, title: string): number | null {
  if (query.words.length === 0) return 0;
  return scoreFolded(query, foldedTitle(title), null);
}

function toRanges(positions: readonly number[], title: FoldedTitle): TitleRange[] {
  const offsets = [...new Set(positions)].sort((a, b) => a - b);
  const ranges: TitleRange[] = [];
  for (const position of offsets) {
    const start = title.origin ? title.origin[position]! : position;
    const end = title.origin ? (title.origin[position + 1] ?? title.length) : position + 1;
    const last = ranges.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }
  return ranges;
}

/** How a title matches a compiled query, with the characters to highlight, or null when any word
 *  misses. A query with no words matches every title, with nothing to highlight. */
export function matchTitle(query: TitleQuery, title: string): TitleMatch | null {
  const prepared = foldedTitle(title);
  const positions: number[] = [];
  const score = scoreFolded(query, prepared, positions);
  return score === null ? null : { score, ranges: toRanges(positions, prepared) };
}

/** Orders scored items best first; equal scores keep their order. */
export function byScore<T>(scored: { item: T; score: number; order: number }[]): T[] {
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map(({ item }) => item);
}

/** The items whose title matches, best first; equal matches, and every item of a query with no
 *  words, keep the items' own order. */
export function rankByTitle<T>(
  items: readonly T[],
  query: TitleQuery,
  titleOf: (item: T) => string,
): T[] {
  if (query.words.length === 0) return [...items];
  const scored: { item: T; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const score = scoreTitle(query, titleOf(item));
    if (score !== null) scored.push({ item, score, order });
  });
  return byScore(scored);
}
