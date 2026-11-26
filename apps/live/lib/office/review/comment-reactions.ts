// Reactions on a comment (docs/specs/034-text-documents/review.md "Reactions"): the quick six, and the chips a
// comment's reactions draw as, each with its count, whether it holds one's own, and the words naming its people.
// Pure, so every surface that draws a thread draws them alike.

/** The reactions offered first, in their order (default). */
export const QUICK_REACTIONS: readonly string[] = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export type ReactionChip = {
  readonly emoji: string;
  readonly count: number;
  /** One's own reaction is among them. */
  readonly mine: boolean;
  /** Who gave it, in words: "You and Ada reacted with 👍". */
  readonly label: string;
};

const listed = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

const rank = (emoji: string): number => {
  const at = QUICK_REACTIONS.indexOf(emoji);
  return at < 0 ? QUICK_REACTIONS.length : at;
};

/** A comment's reactions as chips: the quick six first in their order, then the others by their characters. */
export function reactionChips(
  reactions: Readonly<Record<string, readonly string[]>> | undefined,
  selfKey: string,
  names: ReadonlyMap<string, string>,
): ReactionChip[] {
  return Object.entries(reactions ?? {})
    .filter(([, keys]) => keys.length > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([emoji, keys]) => {
      const mine = selfKey !== '' && keys.includes(selfKey);
      const others = keys.filter((k) => k !== selfKey).map((k) => names.get(k) ?? 'Someone');
      return {
        emoji,
        count: keys.length,
        mine,
        label: `${listed(mine ? ['You', ...others] : others)} reacted with ${emoji}`,
      };
    });
}

/** Each author key's name, as their latest comment carries it. */
export function reactorNames(
  comments: Iterable<{ authorId?: string; authorName: string; createdAt: number }>,
): Map<string, string> {
  const latest = new Map<string, { name: string; at: number }>();
  for (const c of comments) {
    if (!c.authorId) continue;
    const was = latest.get(c.authorId);
    if (!was || c.createdAt >= was.at)
      latest.set(c.authorId, { name: c.authorName, at: c.createdAt });
  }
  return new Map([...latest].map(([key, { name }]) => [key, name]));
}
