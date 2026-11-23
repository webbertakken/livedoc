// docs/specs/034-text-documents/objects.md "Emoji": the catalogue generated from Emojibase's English data, by group in
// Unicode's order, each emoji with its name, tags, shortcodes and its five skin tones.
import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, emojiCatalogueOf, uniformTone } from './emoji-catalogue';

const skin = (label: string, unicode: string) => ({ label, unicode, hexcode: '', order: 0 });
const TONES = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];

const COMPACT = [
  { hexcode: '1F1E6', label: 'regional indicator A', unicode: '🇦' },
  { group: 2, hexcode: '1F3FB', label: 'light skin tone', unicode: '🏻', order: 9 },
  {
    group: 1,
    hexcode: '1F44B',
    label: 'waving hand',
    order: 2,
    tags: ['hello', 'wave'],
    unicode: '👋',
    skins: TONES.map((t, i) => skin(`waving hand: ${t} skin tone`, `👋${i}`)),
  },
  { group: 0, hexcode: '1F600', label: 'grinning face', order: 1, tags: ['face'], unicode: '😀' },
  {
    group: 1,
    hexcode: '1F91D',
    label: 'handshake',
    order: 3,
    tags: ['agreement'],
    unicode: '🤝',
    skins: [
      ...TONES.map((t, i) => skin(`handshake: ${t} skin tone`, `🤝${i}`)),
      skin('handshake: light skin tone, dark skin tone', '🤝x'),
    ].reverse(),
  },
];

const SHORTCODES = { '1F44B': ['wave', 'waving_hand'], '1F600': 'grinning' };

describe('uniformTone (the one tone a skin is in)', () => {
  it.each([
    ['waving hand: medium skin tone', 'medium'],
    ['person: medium-light skin tone, blond hair', 'medium-light'],
    ['handshake: light skin tone, dark skin tone', null],
    ['grinning face', null],
  ])('reads %s as %s', (label, tone) => {
    expect(uniformTone(label)).toBe(tone);
  });
});

describe('emojiCatalogueOf (the catalogue written)', () => {
  const wire = emojiCatalogueOf({ version: '18.0.0', compact: COMPACT, shortcodes: [SHORTCODES] });

  it('names the nine groups, components left out', () => {
    expect(EMOJI_GROUPS).toHaveLength(9);
    expect(EMOJI_GROUPS[0]).toBe('Smileys & emotion');
    expect(EMOJI_GROUPS[8]).toBe('Flags');
  });

  it('keeps grouped emoji in Unicode order, with group index, name, tags and shortcodes', () => {
    expect(wire.version).toBe('18.0.0');
    expect(wire.emoji.map((e) => e[1])).toEqual(['😀', '👋', '🤝']);
    expect(wire.emoji[0]).toEqual([0, '😀', 'grinning face', 'face', 'grinning']);
    expect(wire.emoji[1]!.slice(0, 5)).toEqual([
      1,
      '👋',
      'waving hand',
      'hello wave',
      'wave waving_hand',
    ]);
  });

  it('gives an emoji with tones its five uniform ones, lightest first', () => {
    expect(wire.emoji[1]![5]).toEqual(['👋0', '👋1', '👋2', '👋3', '👋4']);
    expect(wire.emoji[2]![5]).toEqual(['🤝0', '🤝1', '🤝2', '🤝3', '🤝4']);
    expect(wire.emoji[0]).toHaveLength(5);
  });
});
