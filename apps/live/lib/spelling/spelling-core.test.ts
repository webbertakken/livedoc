import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createSpellingCore } from './spelling-core';
import type { SpellingLanguage } from './spelling-languages';

const PACKAGES: Record<SpellingLanguage, string> = {
  nl: 'dictionary-nl',
  fr: 'dictionary-fr',
};
const files = (language: SpellingLanguage) => {
  const dir = new URL(`../../node_modules/${PACKAGES[language]}/`, import.meta.url);
  return Promise.resolve({
    aff: readFileSync(new URL('index.aff', dir)),
    dic: readFileSync(new URL('index.dic', dir)),
  });
};
// The real dictionaries, each built once for the file: French alone takes a second or two.
const real = createSpellingCore(files);
// A dictionary of one word, for how loading behaves: built in a moment.
const tiny = () =>
  Promise.resolve({
    aff: new TextEncoder().encode('SET UTF-8\n'),
    dic: new TextEncoder().encode('1\nhuis\n'),
  });

// The first real test waits while its dictionaries are built.
describe('createSpellingCore', { timeout: 30_000 }, () => {
  it('names the misspelt words, by the language’s dictionary', async () => {
    const core = real;
    expect(await core.check('nl', ['huis', 'hius', 'maison'])).toEqual(['hius', 'maison']);
    expect(await core.check('fr', ['maison', 'miason'])).toEqual(['miason']);
  });

  it('loads each dictionary once', async () => {
    const load = vi.fn(tiny);
    const core = createSpellingCore(load);
    await Promise.all([core.check('nl', ['a']), core.check('nl', ['b'])]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('puts a correct swap of two neighbours first', async () => {
    const core = real;
    const suggestions = await core.suggest('nl', 'hius', 5);
    expect(suggestions[0]).toBe('huis');
    expect(suggestions).toHaveLength(5);
    expect(await core.suggest('fr', 'miason', 5)).toEqual(['maison', 'Mason']);
    expect(await core.suggest('nl', 'fietss', 1)).toEqual(['fiets']);
  });

  it('tries a failed load again on the next request', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(tiny);
    const core = createSpellingCore(load);
    await expect(core.check('nl', ['hius'])).rejects.toThrow('offline');
    expect(await core.check('nl', ['hius'])).toEqual(['hius']);
  });
});
