// The emoji a person chose (docs/specs/034-text-documents/objects.md "Emoji"): their skin tone and the 24 emoji they
// inserted last, newest first, in this browser. Unreadable or full storage forgets: the default yellow, none recent.
import { debugLog } from '@/lib/debug-log';
import { SKIN_TONES, type SkinTone } from './emoji-catalogue';

export const EMOJI_TONE_KEY = 'livedoc:v2:office-emoji-tone';
export const EMOJI_RECENT_KEY = 'livedoc:v2:office-recent-emoji';
export const EMOJI_RECENT_MAX = 24;

function keep(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    debugLog(`[office] emoji choice not kept ${String(error)}`);
  }
}

export function readEmojiTone(): SkinTone | null {
  try {
    const tone = localStorage.getItem(EMOJI_TONE_KEY);
    return SKIN_TONES.find((t) => t === tone) ?? null;
  } catch {
    return null;
  }
}

/** Keeps the tone chosen; null for the default yellow. */
export const saveEmojiTone = (tone: SkinTone | null): void => keep(EMOJI_TONE_KEY, tone);

export function readRecentEmoji(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((e): e is string => typeof e === 'string').slice(0, EMOJI_RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function noteRecentEmoji(emoji: string): void {
  const next = [emoji, ...readRecentEmoji().filter((e) => e !== emoji)].slice(0, EMOJI_RECENT_MAX);
  keep(EMOJI_RECENT_KEY, JSON.stringify(next));
}
