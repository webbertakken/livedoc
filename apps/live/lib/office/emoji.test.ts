// docs/specs/034-text-documents/objects.md "Emoji": the catalogue read, browsed by group, searched by name, tags and
// shortcodes, shown in a skin tone, and the colon list's matches.
import { describe, expect, it } from 'vitest';
import file from './emoji.json';
import { EMOJI_GROUPS } from './emoji-catalogue';
import {
  EMOJI_COLON_MAX,
  colonMatches,
  emojiName,
  emojiOf,
  emojisOf,
  inGroup,
  inTone,
  searchEmoji,
  type Emoji,
} from './emoji';

const catalogue = emojisOf({
  version: '18.0.0',
  emoji: [
    [0, '😀', 'grinning face', 'face grin', 'grinning_face grinning'],
    [1, '👋', 'waving hand', 'hello wave', 'waving_hand wave', ['👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿']],
    [1, '👍', 'thumbs up', '+1 hand', 'thumbs_up +1 thumbsup'],
    [7, '🔣', 'input symbols', 'input', 'input_symbols symbols'],
    [8, '🇳🇱', 'flag: Netherlands', 'NL flag', 'flag_netherlands nl'],
    'junk',
    [99, '?', 'nowhere', '', ''],
  ],
});
const shown = (emoji: readonly Emoji[]) => emoji.map((e) => e.emoji);

describe('emojisOf (the generated file read)', () => {
  it('reads each emoji, dropping what is malformed', () => {
    expect(shown(catalogue.emoji)).toEqual(['😀', '👋', '👍', '🔣', '🇳🇱']);
    expect(catalogue.emoji[1]).toEqual({
      emoji: '👋',
      name: 'waving hand',
      group: 'People & body',
      tags: ['hello', 'wave'],
      shortcodes: ['waving_hand', 'wave'],
      tones: ['👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'],
    });
    expect(emojisOf(null).emoji).toEqual([]);
  });

  it('reads the whole generated file, every group in it', () => {
    const full = emojisOf(file);
    expect(full.emoji.length).toBe(file.emoji.length);
    for (const group of EMOJI_GROUPS) expect(inGroup(full, group).length).toBeGreaterThan(0);
  });
});

describe('browsing and finding', () => {
  it('lists a group in Unicode order', () => {
    expect(shown(inGroup(catalogue, 'People & body'))).toEqual(['👋', '👍']);
  });

  it('finds an emoji by a word of its name, tags or shortcodes, every word typed', () => {
    expect(shown(searchEmoji(catalogue, 'wave'))).toEqual(['👋']);
    expect(shown(searchEmoji(catalogue, 'HAND thumbs'))).toEqual(['👍']);
    expect(shown(searchEmoji(catalogue, 'netherl'))).toEqual(['🇳🇱']);
    expect(searchEmoji(catalogue, '  ')).toEqual([]);
  });

  it('finds an emoji by its text, in any tone', () => {
    expect(emojiOf(catalogue, '👋🏽')?.name).toBe('waving hand');
    expect(emojiOf(catalogue, '👍')?.name).toBe('thumbs up');
    expect(emojiOf(catalogue, 'x')).toBeNull();
  });
});

describe('inTone and emojiName', () => {
  it('shows an emoji with tones in the tone chosen, others as they are', () => {
    const [, wave, thumbs] = catalogue.emoji;
    expect(inTone(wave!, 'medium')).toBe('👋🏽');
    expect(inTone(wave!, null)).toBe('👋');
    expect(inTone(thumbs!, 'dark')).toBe('👍');
  });

  it('names an emoji in sentence case', () => {
    expect(emojiName('waving hand')).toBe('Waving hand');
    expect(emojiName('flag: Netherlands')).toBe('Flag: Netherlands');
  });
});

describe('colonMatches (the colon list)', () => {
  it('lists shortcodes beginning with what was typed first, then name words, in Unicode order', () => {
    expect(shown(colonMatches(catalogue, 'wa'))).toEqual(['👋']);
    expect(shown(colonMatches(catalogue, 'thu'))).toEqual(['👍']);
    expect(shown(colonMatches(catalogue, '+1'))).toEqual(['👍']);
    expect(shown(colonMatches(catalogue, 'sym'))).toEqual(['🔣']);
    expect(shown(colonMatches(catalogue, 'gr'))).toEqual(['😀']);
    expect(shown(colonMatches(catalogue, 'hand'))).toEqual(['👋']);
  });

  it('shows at most eight', () => {
    expect(EMOJI_COLON_MAX).toBe(8);
    expect(colonMatches(emojisOf(file), 'fa').length).toBe(8);
  });
});
