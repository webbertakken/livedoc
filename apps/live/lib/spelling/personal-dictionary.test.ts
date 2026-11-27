// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onPersonalDictionaryChange,
  PERSONAL_DICTIONARY_MAX,
  PersonalDictionary,
  readPersonalDictionary,
  savePersonalDictionary,
} from './personal-dictionary';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';

afterEach(() => localStorage.clear());

describe('PersonalDictionary', () => {
  it('parses only valid words, once each, up to the limit', () => {
    const many = Array.from(
      { length: PERSONAL_DICTIONARY_MAX + 5 },
      (_, i) => `w${'a'.repeat(i % 40)}${i}x`,
    );
    expect(
      PersonalDictionary.parse(['Livedoc', 'Livedoc', 'two words', '', 3, 'x'.repeat(49)]).words,
    ).toEqual(['Livedoc']);
    expect(PersonalDictionary.parse('nope').words).toEqual([]);
    expect(PersonalDictionary.parse(many).words).toHaveLength(PERSONAL_DICTIONARY_MAX);
  });

  it('adds a word, refusing what is present, invalid or past the limit', () => {
    const one = PersonalDictionary.add(PersonalDictionary.empty(), 'Livedoc');
    expect(one).toEqual({ ok: true, dictionary: { words: ['Livedoc'] } });
    if (!one.ok) throw new Error('unreachable');
    expect(PersonalDictionary.add(one.dictionary, 'Livedoc')).toEqual({
      ok: false,
      refusal: 'present',
    });
    expect(PersonalDictionary.add(one.dictionary, 'two words')).toEqual({
      ok: false,
      refusal: 'invalid',
    });
    const full = { words: Array.from({ length: PERSONAL_DICTIONARY_MAX }, (_, i) => `w${i}`) };
    expect(PersonalDictionary.add(full, 'more')).toEqual({ ok: false, refusal: 'full' });
  });

  it('removes a word', () => {
    expect(PersonalDictionary.remove({ words: ['a', 'b'] }, 'a')).toEqual({ words: ['b'] });
  });

  it('knows a word as written, and with its first letter lowered', () => {
    const d = { words: ['livedoc', 'McGuffin'] };
    expect(PersonalDictionary.has(d, 'livedoc')).toBe(true);
    expect(PersonalDictionary.has(d, 'Livedoc')).toBe(true);
    expect(PersonalDictionary.has(d, 'McGuffin')).toBe(true);
    expect(PersonalDictionary.has(d, 'mcguffin')).toBe(false);
    expect(PersonalDictionary.has(d, 'LIVEDOC')).toBe(false);
  });
});

describe('the stored personal dictionary', () => {
  it('reads and saves through the preferences, keeping the rest', () => {
    writeUserPreferences({ mapSize: 'tall' });
    savePersonalDictionary({ words: ['Livedoc'] }, null);
    expect(readUserPreferences()).toMatchObject({
      mapSize: 'tall',
      personalDictionary: ['Livedoc'],
    });
    expect(readPersonalDictionary().words).toEqual(['Livedoc']);
    savePersonalDictionary(PersonalDictionary.empty(), null);
    expect(readUserPreferences()).not.toHaveProperty('personalDictionary');
  });

  it('tells of a change', () => {
    const heard = vi.fn();
    const stop = onPersonalDictionaryChange(heard);
    savePersonalDictionary({ words: ['a'] }, null);
    window.dispatchEvent(new StorageEvent('storage'));
    stop();
    savePersonalDictionary({ words: ['b'] }, null);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
