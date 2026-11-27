// Counting a text document's writing (docs/specs/034-text-documents/tools.md "Word count", "What counts"): words as the
// browser segments them (word-like segments), characters as a reader sees them (grapheme clusters), paragraph and line
// breaks never counted. Each paragraph is counted on its own, so no word runs across two; a field counts the text it
// shows, and pictures, equations, bookmarks and footnote marks count nothing, though they still part the words beside
// them.
import type { Node as PmNode } from 'prosemirror-model';
import { FIELD } from '@livedoc/text-documents';

export type WordCounts = {
  readonly words: number;
  readonly characters: number;
  readonly charactersExcludingSpaces: number;
};

export const NO_COUNTS: WordCounts = { words: 0, characters: 0, charactersExcludingSpaces: 0 };

/** What stands for an object in a line: it parts words, and is never counted. */
const BREAK = '\n';
const SPACE = /^\s+$/u;

const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The counts of one run of text. */
export function countText(text: string): WordCounts {
  let wordCount = 0;
  for (const segment of words.segment(text)) if (segment.isWordLike) wordCount++;
  let characters = 0;
  let spaces = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (segment === BREAK || segment === '\r\n' || segment === '\r') continue;
    characters++;
    if (SPACE.test(segment)) spaces++;
  }
  return { words: wordCount, characters, charactersExcludingSpaces: characters - spaces };
}

const add = (a: WordCounts, b: WordCounts): WordCounts => ({
  words: a.words + b.words,
  characters: a.characters + b.characters,
  charactersExcludingSpaces: a.charactersExcludingSpaces + b.charactersExcludingSpaces,
});

const leafText = (node: PmNode): string =>
  node.type.name === FIELD ? (node.type.spec.leafText?.(node) ?? '') : BREAK;

/** The counts of the writing, or of what lies between `from` and `to`, paragraph by paragraph (tables included). */
export function countWriting(doc: PmNode, from = 0, to = doc.content.size): WordCounts {
  let counts = NO_COUNTS;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + 1 + node.content.size);
    if (end > start) counts = add(counts, countText(doc.textBetween(start, end, BREAK, leafText)));
    return false;
  });
  return counts;
}
