// The special characters dialog's catalogue (docs/specs/034-text-documents/objects.md "Special characters"): the file
// special-character-catalogue.ts generates, read once the dialog first opens; browsed by category and block, and
// searched by name words or codepoint.
import { wordsOf } from './word-match';
import {
  SPECIAL_CHARACTER_CATEGORIES,
  type SpecialCharacterCategory,
} from './special-character-catalogue';

export { SPECIAL_CHARACTER_CATEGORIES, type SpecialCharacterCategory };

/** The most search results the grid shows (default): a short word matches thousands, and each is a button. */
export const SPECIAL_CHARACTER_RESULTS_MAX = 600;

export type SpecialCharacterLook =
  | { readonly kind: 'glyph' }
  // A combining mark, drawn on a dotted circle.
  | { readonly kind: 'mark' }
  // A space or format character, drawn as its abbreviation in a dashed box.
  | { readonly kind: 'abbreviation'; readonly text: string };

export type SpecialCharacter = {
  readonly codepoint: number;
  // Unicode's name, as Unicode writes it.
  readonly name: string;
  readonly look: SpecialCharacterLook;
};

export type SpecialCharacterGroup = {
  readonly category: SpecialCharacterCategory;
  readonly block: string;
  readonly characters: readonly SpecialCharacter[];
};

type Range = { readonly first: number; readonly last: number; readonly name: string };

export type SpecialCharacters = {
  readonly version: string;
  readonly groups: readonly SpecialCharacterGroup[];
  readonly ranges: readonly Range[];
};

const GLYPH: SpecialCharacterLook = { kind: 'glyph' };
const MARK: SpecialCharacterLook = { kind: 'mark' };

function lookOf(text: string | undefined): SpecialCharacterLook {
  if (text === 'm') return MARK;
  if (text?.startsWith('=')) return { kind: 'abbreviation', text: text.slice(1) };
  return GLYPH;
}

function charactersOf(entries: string): SpecialCharacter[] {
  const characters: SpecialCharacter[] = [];
  let at = 0;
  for (const entry of entries.split('\n')) {
    const [step, name, look] = entry.split('|');
    // A malformed line is skipped and the steps run on from the last good one.
    if (!step || !/^[0-9a-z]+$/.test(step) || !name) continue;
    at += Number.parseInt(step, 36);
    characters.push({ codepoint: at, name, look: lookOf(look) });
  }
  return characters;
}

const isRow = (value: unknown): value is unknown[] => Array.isArray(value);

/** The generated file read, anything malformed in it dropped. */
export function specialCharactersOf(raw: unknown): SpecialCharacters {
  const file = (raw ?? {}) as { version?: unknown; groups?: unknown; ranges?: unknown };
  const groups = (isRow(file.groups) ? file.groups : []).flatMap((row): SpecialCharacterGroup[] => {
    if (!isRow(row)) return [];
    const [index, block, entries] = row;
    const category = typeof index === 'number' ? SPECIAL_CHARACTER_CATEGORIES[index] : undefined;
    if (!category || typeof block !== 'string' || typeof entries !== 'string') return [];
    return [{ category, block, characters: charactersOf(entries) }];
  });
  const ranges = (isRow(file.ranges) ? file.ranges : []).flatMap((row): Range[] => {
    if (!isRow(row)) return [];
    const [first, last, name] = row;
    return typeof first === 'number' && typeof last === 'number' && typeof name === 'string'
      ? [{ first, last, name }]
      : [];
  });
  return { version: typeof file.version === 'string' ? file.version : '', groups, ranges };
}

/** The blocks a category has characters in, in codepoint order. */
export function blocksIn(
  catalogue: SpecialCharacters,
  category: SpecialCharacterCategory,
): string[] {
  return catalogue.groups.filter((g) => g.category === category).map((g) => g.block);
}

/** A block's characters of a category; none where the block has none of it. */
export function groupOf(
  catalogue: SpecialCharacters,
  category: SpecialCharacterCategory,
  block: string,
): readonly SpecialCharacter[] {
  return (
    catalogue.groups.find((g) => g.category === category && g.block === block)?.characters ?? []
  );
}

const CODEPOINT_MAX = 0x10ffff;
const isSurrogate = (cp: number) => cp >= 0xd800 && cp <= 0xdfff;

/** The codepoint typed: `U+` and 1 to 6 hex digits, or 4 to 6 hex digits alone; null for anything else. */
export function codepointOf(query: string): number | null {
  const match = /^(?:u\+([0-9a-f]{1,6})|([0-9a-f]{4,6}))$/i.exec(query.trim());
  const digits = match?.[1] ?? match?.[2];
  if (!digits) return null;
  const cp = Number.parseInt(digits, 16);
  return cp <= CODEPOINT_MAX && !isSurrogate(cp) ? cp : null;
}

// Hangul syllables are named by Unicode's rule NR1, from their jamo.
const JAMO_L = 'G GG N D DD R M B BB S SS _ J JJ C K T P H'
  .split(' ')
  .map((j) => (j === '_' ? '' : j));
const JAMO_V = 'A AE YA YAE EO E YEO YE O WA WAE OE YO U WEO WE WI YU EU YI I'.split(' ');
const JAMO_T = [
  '',
  ...'G GG GS N NJ NH D L LG LM LB LS LT LP LH M B BS S SS NG J C K T P H'.split(' '),
];
const HANGUL_FIRST = 0xac00;

function hangulName(cp: number): string {
  const index = cp - HANGUL_FIRST;
  const l = Math.floor(index / (JAMO_V.length * JAMO_T.length));
  const v = Math.floor((index % (JAMO_V.length * JAMO_T.length)) / JAMO_T.length);
  const t = index % JAMO_T.length;
  return `HANGUL SYLLABLE ${JAMO_L[l]}${JAMO_V[v]}${JAMO_T[t]}`;
}

const hexOf = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0');

/** The character at a codepoint: a named one, or one of a range named by rule; null for any other. */
export function characterAt(catalogue: SpecialCharacters, cp: number): SpecialCharacter | null {
  for (const group of catalogue.groups) {
    const found = group.characters.find((c) => c.codepoint === cp);
    if (found) return found;
  }
  const range = catalogue.ranges.find((r) => cp >= r.first && cp <= r.last);
  if (!range) return null;
  const name = range.name === 'HANGUL SYLLABLE' ? hangulName(cp) : `${range.name}-${hexOf(cp)}`;
  return { codepoint: cp, name, look: GLYPH };
}

// Each named character's name words, split once on the first search.
const words = new WeakMap<SpecialCharacters, readonly (readonly [SpecialCharacter, string[]])[]>();

function wordsIn(catalogue: SpecialCharacters) {
  let found = words.get(catalogue);
  if (!found) {
    found = catalogue.groups
      .flatMap((g) => g.characters)
      .sort((a, b) => a.codepoint - b.codepoint)
      .map((c) => [c, wordsOf(c.name)] as const);
    words.set(catalogue, found);
  }
  return found;
}

/**
 * The characters a search finds: a codepoint's character first, then each whose name has a word starting with every
 * word typed, in codepoint order; at most `limit`.
 */
export function searchCharacters(
  catalogue: SpecialCharacters,
  query: string,
  limit = SPECIAL_CHARACTER_RESULTS_MAX,
): SpecialCharacter[] {
  const typed = wordsOf(query);
  const cp = codepointOf(query);
  const found: SpecialCharacter[] = [];
  const atCodepoint = cp === null ? null : characterAt(catalogue, cp);
  if (atCodepoint) found.push(atCodepoint);
  if (typed.length === 0) return found;
  for (const [character, names] of wordsIn(catalogue)) {
    if (found.length >= limit) break;
    if (character === atCodepoint) continue;
    if (typed.every((word) => names.some((name) => name.startsWith(word)))) found.push(character);
  }
  return found;
}

/** A codepoint as text. */
export const characterText = (cp: number): string => String.fromCodePoint(cp);

/** A codepoint as Unicode writes it: `U+` and at least four hex digits. */
export const codepointLabel = (cp: number): string => `U+${hexOf(cp)}`;

/**
 * A character's name as the dialog shows and reads it: sentence case (default), keeping a word of one letter and a
 * word with digits as Unicode writes them (`Latin small letter A`, `ideograph-4E00`).
 */
export function characterName(name: string): string {
  const lower = name
    .split(/([ -])/)
    .map((word) => (word.length === 1 || /\d/.test(word) ? word : word.toLowerCase()))
    .join('');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

let loading: Promise<SpecialCharacters> | null = null;

/** The catalogue, imported once on first ask; a failed import is asked again next time. */
export function loadSpecialCharacters(): Promise<SpecialCharacters> {
  loading ??= import('./special-characters.json').then(
    (module) => specialCharactersOf(module.default),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
