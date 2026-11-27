// The languages LiveDoc checks spelling in itself (docs/specs/034-text-documents/tools.md "Spelling and grammar"):
// each has a Hunspell dictionary with a licence the repo allows; any other language keeps the browser's own check.
export const SPELLING_LANGUAGES = ['nl', 'fr'] as const;
export type SpellingLanguage = (typeof SPELLING_LANGUAGES)[number];

/** The shipped dictionary for a BCP 47 language tag, or null where the browser's own check stays on. */
export function spellingLanguageFor(tag: string | null | undefined): SpellingLanguage | null {
  const [language = ''] = (tag ?? '').toLowerCase().split(/[-_]/);
  if (language === 'nl') return 'nl';
  if (language === 'fr') return 'fr';
  return null;
}

/** The language a document is checked in: its own once File > Language sets one, today the browser's. */
export const documentSpellingTag = (): string =>
  typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
