// The page's side of the spelling check (docs/specs/034-text-documents/tools.md "Spelling and grammar"): one worker,
// made on the first request, and every verdict it gives kept, so a word is asked about once per language.
import type { SpellingLanguage } from './spelling-languages';
import type { SpellingAsk, SpellingRequest, SpellingResponse } from './spelling-protocol';

/** The most verdicts kept per language (safe 10,000..200,000): past it they are all forgotten at once. */
export const SPELLING_CACHE_MAX = 50_000;
/** The most suggestions offered for a word (Google's context menu shows a handful). */
export const SPELLING_SUGGESTIONS_MAX = 5;

export type SpellingWorker = {
  postMessage: (request: SpellingRequest) => void;
  addEventListener: (type: 'message', fn: (e: MessageEvent<SpellingResponse>) => void) => void;
};

export type SpellingChecker = {
  /** The misspelt words among `words`; none when the check fails (never a wrong underline). */
  check: (language: SpellingLanguage, words: readonly string[]) => Promise<ReadonlySet<string>>;
  /** Whether `word` is spelt right, when already known. */
  known: (language: SpellingLanguage, word: string) => boolean | undefined;
  /** Up to SPELLING_SUGGESTIONS_MAX suggestions; none when the check fails. */
  suggest: (language: SpellingLanguage, word: string) => Promise<readonly string[]>;
  /** The correction the checker is sure of, or null; null too when the check fails. */
  correct: (language: SpellingLanguage, word: string) => Promise<string | null>;
};

const newWorker = (): SpellingWorker =>
  new Worker(new URL('./spelling.worker.ts', import.meta.url), { type: 'module' });

export function createSpellingChecker(
  makeWorker: () => SpellingWorker = newWorker,
): SpellingChecker {
  let worker: SpellingWorker | null | undefined;
  let nextId = 1;
  const waiting = new Map<number, (response: SpellingResponse) => void>();
  const verdicts = new Map<SpellingLanguage, Map<string, boolean>>();
  const suggestions = new Map<string, readonly string[]>();
  const corrections = new Map<string, string | null>();

  const ask = (request: SpellingAsk): Promise<SpellingResponse | null> => {
    if (worker === undefined) {
      try {
        worker = makeWorker();
        worker.addEventListener('message', ({ data }) => {
          waiting.get(data.id)?.(data);
          waiting.delete(data.id);
        });
      } catch (err) {
        console.warn('[spelling] worker refused', { detail: String(err) });
        worker = null;
      }
    }
    if (!worker) return Promise.resolve(null);
    const id = nextId++;
    const sent = worker;
    return new Promise((resolve) => {
      waiting.set(id, (response) => {
        if (response.kind === 'failed') {
          console.warn('[spelling] check failed', {
            error: response.error,
            detail: response.detail,
          });
          resolve(null);
        } else resolve(response);
      });
      sent.postMessage({ ...request, id });
    });
  };

  const verdictsOf = (language: SpellingLanguage): Map<string, boolean> => {
    let known = verdicts.get(language);
    if (!known) verdicts.set(language, (known = new Map<string, boolean>()));
    return known;
  };

  return {
    known: (language, word) => verdicts.get(language)?.get(word),
    check: async (language, words) => {
      const known = verdictsOf(language);
      const unheard = [...new Set(words.filter((w) => !known.has(w)))];
      if (unheard.length > 0) {
        const response = await ask({ kind: 'check', language, words: unheard });
        if (response?.kind !== 'checked') return new Set();
        const misspelt = new Set(response.misspelt);
        const found = new Set(words.filter((w) => misspelt.has(w) || known.get(w) === false));
        if (known.size + unheard.length > SPELLING_CACHE_MAX) known.clear();
        for (const w of unheard) known.set(w, !misspelt.has(w));
        return found;
      }
      return new Set(words.filter((w) => known.get(w) === false));
    },
    suggest: async (language, word) => {
      const key = `${language}\u0000${word}`;
      const kept = suggestions.get(key);
      if (kept) return kept;
      const response = await ask({
        kind: 'suggest',
        language,
        word,
        most: SPELLING_SUGGESTIONS_MAX,
      });
      if (response?.kind !== 'suggested') return [];
      suggestions.set(key, response.suggestions);
      return response.suggestions;
    },
    correct: async (language, word) => {
      const key = `${language}\u0000${word}`;
      if (corrections.has(key)) return corrections.get(key)!;
      const response = await ask({ kind: 'correct', language, word });
      if (response?.kind !== 'corrected') return null;
      corrections.set(key, response.correction);
      return response.correction;
    },
  };
}

let shared: SpellingChecker | null = null;
/** The page's one spelling checker. */
export const spellingChecker = (): SpellingChecker => (shared ??= createSpellingChecker());
