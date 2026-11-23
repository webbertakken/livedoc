// The emoji dialog's and the colon list's catalogue (docs/specs/034-text-documents/objects.md "Emoji"): the file
// emoji-catalogue.ts generates, read once first asked for; browsed by group, searched by name, tags and shortcodes,
// and shown in a skin tone.
import { EMOJI_GROUPS, SKIN_TONES, type EmojiGroup, type SkinTone } from './emoji-catalogue';
import { wordsOf } from './word-match';

export { EMOJI_GROUPS, SKIN_TONES, type EmojiGroup, type SkinTone };

/** The most emoji the colon list shows (default). */
export const EMOJI_COLON_MAX = 8;

export type Emoji = {
  readonly emoji: string;
  // Emojibase's English name, as it writes it.
  readonly name: string;
  readonly group: EmojiGroup;
  readonly tags: readonly string[];
  readonly shortcodes: readonly string[];
  // The five uniform skin tones, lightest first, for an emoji that has them.
  readonly tones?: readonly string[];
};

export type Emojis = { readonly version: string; readonly emoji: readonly Emoji[] };

const isText = (value: unknown): value is string => typeof value === 'string';
const listOf = (text: string) => text.split(' ').filter(Boolean);

/** The generated file read, anything malformed in it dropped. */
export function emojisOf(raw: unknown): Emojis {
  const file = (raw ?? {}) as { version?: unknown; emoji?: unknown };
  const rows: unknown[] = Array.isArray(file.emoji) ? file.emoji : [];
  const emoji = rows.flatMap((row): Emoji[] => {
    if (!Array.isArray(row)) return [];
    const [index, text, name, tags, shortcodes, tones] = row as unknown[];
    const group = typeof index === 'number' ? EMOJI_GROUPS[index] : undefined;
    if (!group || !isText(text) || !isText(name) || !isText(tags) || !isText(shortcodes)) return [];
    const toned =
      Array.isArray(tones) && tones.length === SKIN_TONES.length && tones.every(isText)
        ? { tones: tones as string[] }
        : {};
    return [
      { emoji: text, name, group, tags: listOf(tags), shortcodes: listOf(shortcodes), ...toned },
    ];
  });
  return { version: isText(file.version) ? file.version : '', emoji };
}

/** A group's emoji, in Unicode's order. */
export const inGroup = (catalogue: Emojis, group: EmojiGroup): Emoji[] =>
  catalogue.emoji.filter((e) => e.group === group);

// Each emoji's words (name, tags, shortcodes), split once on the first search.
const words = new WeakMap<Emojis, readonly (readonly [Emoji, string[]])[]>();

function wordsIn(catalogue: Emojis) {
  let found = words.get(catalogue);
  if (!found) {
    found = catalogue.emoji.map(
      (e) => [e, wordsOf([e.name, ...e.tags, ...e.shortcodes].join(' '))] as const,
    );
    words.set(catalogue, found);
  }
  return found;
}

/** The emoji with a word of their name, tags or shortcodes starting with every word typed, in Unicode's order. */
export function searchEmoji(catalogue: Emojis, query: string): Emoji[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return [];
  return wordsIn(catalogue).flatMap(([e, own]) =>
    typed.every((word) => own.some((w) => w.startsWith(word))) ? [e] : [],
  );
}

/** The emoji a text is, in any of its tones; null for none. */
export function emojiOf(catalogue: Emojis, text: string): Emoji | null {
  return catalogue.emoji.find((e) => e.emoji === text || e.tones?.includes(text)) ?? null;
}

/** An emoji as shown and inserted: in the tone chosen where it has tones, else as it is. */
export function inTone(emoji: Emoji, tone: SkinTone | null): string {
  if (!tone || !emoji.tones) return emoji.emoji;
  return emoji.tones[SKIN_TONES.indexOf(tone)] ?? emoji.emoji;
}

/** An emoji's name as shown and read: its first letter a capital. */
export const emojiName = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The colon list for what was typed after `:`: the emoji whose shortcodes begin so first, then those with a name word
 * beginning so, each in Unicode's order; at most `limit`.
 */
export function colonMatches(catalogue: Emojis, typed: string, limit = EMOJI_COLON_MAX): Emoji[] {
  const start = typed.toLowerCase();
  if (!start) return [];
  const byShortcode = catalogue.emoji.filter((e) => e.shortcodes.some((s) => s.startsWith(start)));
  const shown = new Set(byShortcode);
  const byName = catalogue.emoji.filter(
    (e) => !shown.has(e) && wordsOf(e.name).some((w) => w.startsWith(start)),
  );
  return [...byShortcode, ...byName].slice(0, limit);
}

let loading: Promise<Emojis> | null = null;

/** The catalogue, imported once on first ask; a failed import is asked again next time. */
export function loadEmoji(): Promise<Emojis> {
  loading ??= import('./emoji.json').then(
    (module) => emojisOf(module.default),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
