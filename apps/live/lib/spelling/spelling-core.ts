// The spelling worker's checker (docs/specs/034-text-documents/tools.md "Spelling and grammar"): a Hunspell
// dictionary per language, read by nspell, built the first time that language is asked about.
import nspell from 'nspell';
import { debugLog } from '@/lib/debug-log';
import type { SpellingLanguage } from './spelling-languages';

export type DictionaryFiles = { aff: Uint8Array; dic: Uint8Array };
type Speller = ReturnType<typeof nspell>;

export type SpellingCore = {
  /** The words of `words` the language's dictionary does not know, in their order. */
  check: (language: SpellingLanguage, words: readonly string[]) => Promise<string[]>;
  /** At most `most` suggestions for `word`. */
  suggest: (language: SpellingLanguage, word: string, most: number) => Promise<string[]>;
  /** The correction it is sure of for a misspelt `word`, or null (tools.md "Automatically correct spelling"). */
  correct: (language: SpellingLanguage, word: string) => Promise<string | null>;
};

/** Whether two words are one edit apart: one letter inserted, deleted, replaced, or two neighbours swapped. */
export function oneEditApart(a: string, b: string): boolean {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > 1 || a === b) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const rest = (p: number, q: number) => x.slice(p).join('') === y.slice(q).join('');
  if (x.length === y.length)
    return rest(i + 1, i + 1) || (x[i] === y[i + 1] && x[i + 1] === y[i] && rest(i + 2, i + 2));
  return x.length > y.length ? rest(i + 1, i) : rest(i, i + 1);
}

// The first letter's case as typed: "Hius" is corrected to "Huis".
const caseLike = (typed: string, word: string): string =>
  typed.charAt(0) === typed.charAt(0).toUpperCase() &&
  typed.charAt(0) !== typed.charAt(0).toLowerCase()
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word;
const CAPITAL_INSIDE = /\p{Lu}/u;

// Each word made by swapping two neighbouring letters ("teh" -> "the"): the commonest slip, which nspell never tries.
function swaps(word: string): string[] {
  const letters = [...word];
  const made: string[] = [];
  for (let i = 0; i + 1 < letters.length; i++) {
    if (letters[i] === letters[i + 1]) continue;
    const next = [...letters];
    [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
    made.push(next.join(''));
  }
  return made;
}

export function createSpellingCore(
  load: (language: SpellingLanguage) => Promise<DictionaryFiles>,
): SpellingCore {
  const spellers = new Map<SpellingLanguage, Promise<Speller>>();

  const speller = (language: SpellingLanguage): Promise<Speller> => {
    const known = spellers.get(language);
    if (known) return known;
    const started = performance.now();
    const made = load(language).then(({ aff, dic }) => {
      const built = nspell(new TextDecoder().decode(aff), new TextDecoder().decode(dic));
      debugLog('[spelling] dictionary loaded', {
        language,
        bytes: aff.byteLength + dic.byteLength,
        ms: Math.round(performance.now() - started),
      });
      return built;
    });
    // A failed load is forgotten, so the next request tries again.
    made.catch(() => spellers.delete(language));
    spellers.set(language, made);
    return made;
  };

  return {
    check: async (language, words) => {
      const s = await speller(language);
      return words.filter((word) => !s.correct(word));
    },
    suggest: async (language, word, most) => {
      const s = await speller(language);
      const swapped = swaps(word).filter((w) => s.correct(w));
      return [...new Set([...swapped, ...s.suggest(word)])].slice(0, most);
    },
    correct: async (language, word) => {
      const s = await speller(language);
      if (CAPITAL_INSIDE.test(word.slice(1)) || s.correct(word)) return null;
      const swapped = [...new Set(swaps(word).filter((w) => s.correct(w)))];
      if (swapped.length === 1) return caseLike(word, swapped[0]!);
      if (swapped.length > 1) return null;
      const near = [...new Set(s.suggest(word))].filter((w) =>
        oneEditApart(word.toLowerCase(), w.toLowerCase()),
      );
      return near.length === 1 ? caseLike(word, near[0]!) : null;
    },
  };
}
