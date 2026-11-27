import { describe, expect, it } from 'vitest';
import { documentSpellingTag, spellingLanguageFor, SPELLING_LANGUAGES } from './spelling-languages';

describe('spellingLanguageFor', () => {
  it('ships Dutch and French', () => {
    expect(SPELLING_LANGUAGES).toEqual(['nl', 'fr']);
  });

  it.each([
    ['nl', 'nl'],
    ['nl-BE', 'nl'],
    ['fr', 'fr'],
    ['fr-CA', 'fr'],
  ])('reads %s as %s', (tag, language) => {
    expect(spellingLanguageFor(tag)).toBe(language);
  });

  it.each(['de', 'de-DE', 'es', 'en', 'en-GB', 'eng', '', null, undefined])(
    'ships none for %s',
    (tag) => {
      expect(spellingLanguageFor(tag)).toBeNull();
    },
  );
});

describe('documentSpellingTag', () => {
  it('is the browser’s language', () => {
    expect(documentSpellingTag()).toBe(navigator.language);
  });
});
