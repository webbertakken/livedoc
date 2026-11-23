// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Emoji": the skin tone and the 24 recently used, kept in this browser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMOJI_RECENT_KEY,
  EMOJI_RECENT_MAX,
  EMOJI_TONE_KEY,
  noteRecentEmoji,
  readEmojiTone,
  readRecentEmoji,
  saveEmojiTone,
} from './emoji-preferences';

beforeEach(() => localStorage.clear());

describe('the skin tone', () => {
  it('is the default yellow until one is chosen, and kept once chosen', () => {
    expect(readEmojiTone()).toBeNull();
    saveEmojiTone('medium-dark');
    expect(readEmojiTone()).toBe('medium-dark');
    saveEmojiTone(null);
    expect(readEmojiTone()).toBeNull();
  });

  it('reads anything unknown as the default', () => {
    localStorage.setItem(EMOJI_TONE_KEY, 'purple');
    expect(readEmojiTone()).toBeNull();
  });
});

describe('recently used', () => {
  it('keeps the 24 inserted last, newest first, each once', () => {
    for (let i = 0; i < 30; i++) noteRecentEmoji(String(i));
    noteRecentEmoji('29');
    noteRecentEmoji('10');
    const recent = readRecentEmoji();
    expect(EMOJI_RECENT_MAX).toBe(24);
    expect(recent).toHaveLength(24);
    expect(recent.slice(0, 3)).toEqual(['10', '29', '28']);
  });

  it('forgets what it cannot read or keep', () => {
    localStorage.setItem(EMOJI_RECENT_KEY, '{');
    expect(readRecentEmoji()).toEqual([]);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    noteRecentEmoji('👋');
    saveEmojiTone('dark');
    set.mockRestore();
    expect(readRecentEmoji()).toEqual([]);
  });
});
