'use client';

// The word count while typing (docs/specs/034-text-documents/tools.md "Word count", While typing): a small box at the
// bottom left of the writing, "340 words" or "12 of 340 words" with a selection; a press shows the next count.
import type { WordCounts } from '@/lib/text-document/text-document-word-count';
import { countOf } from './TextDocumentWordCountDialog';

/** What the box shows, in the order a press steps through. */
export const WORD_COUNT_SHOWS = [
  'words',
  'characters',
  'charactersExcludingSpaces',
  'pages',
] as const;
export type WordCountShows = (typeof WORD_COUNT_SHOWS)[number];

const NAMES: Record<WordCountShows, [one: string, many: string]> = {
  words: ['word', 'words'],
  characters: ['character', 'characters'],
  charactersExcludingSpaces: ['character excluding spaces', 'characters excluding spaces'],
  pages: ['page', 'pages'],
};

/** "340 words", "12 of 340 words", "1 page". */
export function wordCountLine(
  shows: WordCountShows,
  counts: WordCounts,
  selected: WordCounts | null,
  pages: number | null,
): string {
  const all = shows === 'pages' ? (pages ?? 0) : counts[shows];
  const part = shows === 'pages' || !selected ? null : selected[shows];
  const [one, many] = NAMES[shows];
  return `${countOf(all, part)} ${all === 1 && part === null ? one : many}`;
}

/** The next count a press shows: pages only where pages are laid out. */
export function nextShows(shows: WordCountShows, pages: number | null): WordCountShows {
  const order = WORD_COUNT_SHOWS.filter((s) => s !== 'pages' || pages !== null);
  return order[(order.indexOf(shows) + 1) % order.length] ?? 'words';
}

export function TextDocumentWordCountBox({ line, onPress }: { line: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${line}. Show another count`}
      className="office-shell touch-target absolute bottom-3 left-4 z-20 flex min-h-row items-center rounded-control border border-(--office-line) bg-(--office-dialog) px-3 text-caption text-(--office-ink) tabular-nums shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
    >
      {line}
    </button>
  );
}
