'use client';

// What a text document's spelling plugins read (docs/specs/034-text-documents/tools.md "Spelling and grammar"): the
// checker, the language, the person's personal dictionary and whether misspellings show; and the tell that has every
// editor with the plugin (the body, headers, footers, notes) read all its paragraphs again when one of those changes.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  onPersonalDictionaryChange,
  readPersonalDictionary,
  type PersonalDictionary,
} from '@/lib/spelling/personal-dictionary';
import { spellingChecker, type SpellingChecker } from '@/lib/spelling/spelling-checker';
import { documentSpellingTag } from '@/lib/spelling/spelling-languages';
import { readUserPreferences } from '@/lib/user-preferences';
import type { Misspelling, SpellingSource } from '@/lib/text-document/text-document-spelling';

/** The most misspelt words a read fetches suggestions for ahead of a right-click (safe 10..200). */
export const SPELLING_PREFETCH_MAX = 50;

/** A misspelling's key among the suggestions kept. */
export const suggestionKey = (m: Pick<Misspelling, 'language' | 'word'>) =>
  `${m.language}\u0000${m.word}`;
const keyOf = suggestionKey;
const sameWords = (a: PersonalDictionary, b: PersonalDictionary) =>
  a.words.length === b.words.length && a.words.every((w, i) => w === b.words[i]);
/** Show spelling suggestions, as the person last set it. */
export const readSpellingShown = (): boolean =>
  readUserPreferences().spellingSuggestionsShown !== false;

export type TextDocumentSpellingSource = ReturnType<typeof useTextDocumentSpellingSource>;

export function useTextDocumentSpellingSource({
  textWrites,
  checker = spellingChecker(),
}: {
  /** Whether the person can change the text (Editing or Suggesting): only then do misspellings show. */
  textWrites: boolean;
  checker?: SpellingChecker;
}) {
  const [personalWords, setPersonalWords] = useState(readPersonalDictionary);
  const personal = useRef(personalWords);
  const [showSuggestions, setShowSuggestions] = useState(readSpellingShown);
  const shown = useRef(showSuggestions && textWrites);
  useLayoutEffect(() => {
    shown.current = showSuggestions && textWrites;
  });
  // Each misspelt word's suggestions, fetched when a read finds it, so a right-click has them at once.
  const suggestions = useRef(new Map<string, readonly string[]>());

  // Whoever must read every paragraph again: each editor with the spelling plugin.
  const listeners = useRef(new Set<() => void>());
  const tell = useCallback(() => listeners.current.forEach((listener) => listener()), []);

  const [source] = useState<SpellingSource>(() => ({
    checker,
    language: documentSpellingTag,
    personal: () => personal.current,
    shown: () => shown.current,
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    onFound: (misspelt) => {
      const fresh = [...new Map(misspelt.map((m) => [keyOf(m), m])).values()]
        .filter((m) => !suggestions.current.has(keyOf(m)))
        .slice(0, SPELLING_PREFETCH_MAX);
      for (const m of fresh)
        void checker
          .suggest(m.language, m.word)
          .then((list) => suggestions.current.set(keyOf(m), list));
    },
  }));

  // Misspellings show while the text can be changed and the switch is on: read again when either changes.
  const showing = showSuggestions && textWrites;
  const lastShowing = useRef(showing);
  useEffect(() => {
    if (lastShowing.current === showing) return;
    lastShowing.current = showing;
    tell();
  }, [showing, tell]);

  // The stored personal dictionary read again, and every paragraph with it.
  const refreshPersonal = useCallback(() => {
    const next = readPersonalDictionary();
    personal.current = next;
    setPersonalWords(next);
    tell();
  }, [tell]);

  // A word added or removed, here or in another tab: every paragraph read again, everywhere.
  useEffect(
    () =>
      onPersonalDictionaryChange(() => {
        if (!sameWords(readPersonalDictionary(), personal.current)) refreshPersonal();
      }),
    [refreshPersonal],
  );

  return {
    source,
    checker,
    /** Has every editor with the plugin read all its paragraphs again. */
    tell,
    /** Each misspelt word's suggestions, by suggestionKey, as fetched. */
    suggestions,
    /** Reads the stored personal dictionary again (another tab changed it unheard), and every paragraph with it. */
    refreshPersonal,
    personalWords,
    showSuggestions,
    setShowSuggestions,
  };
}
