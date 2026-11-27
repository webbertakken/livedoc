// The personal dictionary (docs/specs/034-text-documents/tools.md "Spelling and grammar"): the words a person's
// spelling check takes as written, kept in their preferences (the account's, else this browser's), shared by every
// kind that checks spelling.
import { debugLog } from '@/lib/debug-log';
import {
  PREFERENCES_CHANGED_EVENT,
  readUserPreferences,
  writeUserPreferences,
} from '@/lib/user-preferences';

/** The most words kept: 400 of about 13 characters each is some 5 KB of the preferences' 16 KB (safe 100..600). */
export const PERSONAL_DICTIONARY_MAX = 400;
/** The longest word kept (safe 32..64): the spelling check reads none longer. */
export const PERSONAL_WORD_MAX = 48;

export type PersonalDictionary = { readonly words: readonly string[] };
export type PersonalDictionaryRefusal = 'full' | 'invalid' | 'present';

const valid = (word: unknown): word is string =>
  typeof word === 'string' &&
  word.length > 0 &&
  word.length <= PERSONAL_WORD_MAX &&
  !/\s/u.test(word);

export const PersonalDictionary = {
  empty: (): PersonalDictionary => ({ words: [] }),

  /** The words stored, keeping each valid one once, at most PERSONAL_DICTIONARY_MAX. */
  parse: (raw: unknown): PersonalDictionary => ({
    words: Array.isArray(raw)
      ? [...new Set(raw.filter(valid))].slice(0, PERSONAL_DICTIONARY_MAX)
      : [],
  }),

  add: (
    d: PersonalDictionary,
    word: string,
  ):
    | { ok: true; dictionary: PersonalDictionary }
    | { ok: false; refusal: PersonalDictionaryRefusal } => {
    if (!valid(word)) return { ok: false, refusal: 'invalid' };
    if (d.words.includes(word)) return { ok: false, refusal: 'present' };
    if (d.words.length >= PERSONAL_DICTIONARY_MAX) return { ok: false, refusal: 'full' };
    return { ok: true, dictionary: { words: [...d.words, word] } };
  },

  remove: (d: PersonalDictionary, word: string): PersonalDictionary => ({
    words: d.words.filter((w) => w !== word),
  }),

  /** Whether `word` is kept: as written, or with its first letter lowered (a word that starts a sentence). */
  has: (d: PersonalDictionary, word: string): boolean =>
    d.words.includes(word) || d.words.includes(word.charAt(0).toLowerCase() + word.slice(1)),
} as const;

/** The person's personal dictionary, from their preferences. */
export const readPersonalDictionary = (): PersonalDictionary =>
  PersonalDictionary.parse(readUserPreferences().personalDictionary);

/** Keeps the person's personal dictionary on the freshest preferences, synced for `ownerId`. */
export function savePersonalDictionary(d: PersonalDictionary, ownerId: string | null): void {
  const { personalDictionary: _old, ...prefs } = readUserPreferences();
  writeUserPreferences(
    d.words.length > 0 ? { ...prefs, personalDictionary: [...d.words] } : prefs,
    ownerId,
  );
  debugLog('[spelling] personal dictionary saved', { words: d.words.length });
}

/** Calls `listener` whenever the preferences may have changed, in this tab or another. */
export function onPersonalDictionaryChange(listener: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
