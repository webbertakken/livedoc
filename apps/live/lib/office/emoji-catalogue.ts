// The emoji catalogue, generated from Emojibase's English data (docs/specs/034-text-documents/objects.md "Emoji"):
// every fully qualified emoji but the skin tone and hair components, in Unicode's order, each with its group, name,
// tags, shortcodes and, where it has them, its five uniform skin tones. Run by `pnpm chars:emoji`; the editor reads
// what it writes through emoji.ts.

export const EMOJI_GROUPS = [
  'Smileys & emotion',
  'People & body',
  'Animals & nature',
  'Food & drink',
  'Travel & places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
] as const;
export type EmojiGroup = (typeof EMOJI_GROUPS)[number];

// Emojibase's group numbers, its Components group (2) left out.
const GROUP_OF_EMOJIBASE: Record<number, number> = {
  0: 0,
  1: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
};

export const SKIN_TONES = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

/**
 * What the generator writes: one row an emoji, `[group, emoji, name, tags, shortcodes, tones?]`, tags and shortcodes
 * space-separated, tones the five uniform ones from lightest to darkest.
 */
export type EmojiRow =
  | readonly [group: number, emoji: string, name: string, tags: string, shortcodes: string]
  | readonly [
      group: number,
      emoji: string,
      name: string,
      tags: string,
      shortcodes: string,
      tones: readonly string[],
    ];

export type EmojiWire = { readonly version: string; readonly emoji: readonly EmojiRow[] };

type CompactSkin = { label: string; unicode: string };
type CompactEmoji = {
  group?: number;
  hexcode: string;
  label: string;
  order?: number;
  tags?: string[];
  unicode: string;
  skins?: CompactSkin[];
};

/** The one tone a skin is in; null for a skin of two tones or none. */
export function uniformTone(label: string): SkinTone | null {
  const tones = [
    ...label.matchAll(/(?:^|[:,] )(light|medium-light|medium|medium-dark|dark) skin tone/g),
  ];
  return tones.length === 1 ? (tones[0]![1] as SkinTone) : null;
}

const shortcodesOf = (sets: readonly Record<string, string | string[]>[], hexcode: string) => [
  ...new Set(sets.flatMap((set) => [set[hexcode] ?? []].flat())),
];

/** The catalogue of a version of Emojibase's `en/compact.json` and its shortcode sets, most used set first. */
export function emojiCatalogueOf({
  version,
  compact,
  shortcodes,
}: {
  version: string;
  compact: readonly CompactEmoji[];
  shortcodes: readonly Record<string, string | string[]>[];
}): EmojiWire {
  const rows = compact
    .filter((e) => e.group !== undefined && e.group in GROUP_OF_EMOJIBASE)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((e): EmojiRow => {
      const row = [
        GROUP_OF_EMOJIBASE[e.group!]!,
        e.unicode,
        e.label,
        (e.tags ?? []).join(' '),
        shortcodesOf(shortcodes, e.hexcode).join(' '),
      ] as const;
      if (!e.skins) return row;
      const tones = SKIN_TONES.map(
        (tone) => e.skins!.find((skin) => uniformTone(skin.label) === tone)?.unicode,
      );
      return tones.every((t) => t !== undefined) ? [...row, tones] : row;
    });
  return { version, emoji: rows };
}
