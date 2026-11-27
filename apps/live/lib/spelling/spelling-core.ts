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
};

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
  };
}
