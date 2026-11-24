// A line's runs in the order they are seen (docs/specs/035-pdf-documents/marks.md "Laying out"): a line holding
// right-to-left and left-to-right words is ordered by the Unicode Bidirectional Algorithm (UAX 9), from the line's own
// direction. The levels come from the typesetter (bidi-js, loaded with the shaper); cutting runs at each change of
// level and reversing them (rule L2) is pure.
import type { MarkRun } from '../mark-faces';

/** A run of one face at one embedding level: an odd level reads right to left. */
export type LeveledRun = MarkRun & { readonly level: number };

/** Whether a code unit is the second half of a character past the Basic Multilingual Plane. */
const trailing = (text: string, at: number): boolean => {
  const unit = text.charCodeAt(at);
  return unit >= 0xdc00 && unit <= 0xdfff;
};

/** A line's runs cut wherever the embedding level changes; `levels` holds one per code unit of the line. */
function leveled(runs: readonly MarkRun[], levels: readonly number[]): LeveledRun[] {
  const pieces: LeveledRun[] = [];
  let offset = 0;
  for (const { face, text } of runs) {
    let start = 0;
    for (let at = 1; at <= text.length; at += 1) {
      const level = levels[offset + start]!;
      const ends = at === text.length || (!trailing(text, at) && levels[offset + at] !== level);
      if (!ends) continue;
      pieces.push({ face, text: text.slice(start, at), level });
      start = at;
    }
    offset += text.length;
  }
  return pieces;
}

/**
 * A line's runs in visual order, left to right: cut at each change of level, then, from the highest level to the
 * lowest odd one, each stretch at that level or higher reversed (UAX 9 rule L2).
 */
export function inVisualOrder(runs: readonly MarkRun[], levels: readonly number[]): LeveledRun[] {
  const pieces = leveled(runs, levels);
  if (pieces.length === 0) return pieces;
  const highest = Math.max(...pieces.map(({ level }) => level));
  const lowestOdd = Math.min(...pieces.map(({ level }) => level | 1));
  for (let level = highest; level >= lowestOdd; level -= 1) {
    let at = 0;
    while (at < pieces.length) {
      if (pieces[at]!.level < level) {
        at += 1;
        continue;
      }
      let end = at;
      while (end < pieces.length && pieces[end]!.level >= level) end += 1;
      pieces.splice(at, end - at, ...pieces.slice(at, end).reverse());
      at = end;
    }
  }
  return pieces;
}
