// What differs between a mark's words before and after a change (live-editing-and-storage.md "A change and what takes
// it back"): the characters from the first that differs to the last, so a change to words held as a text type touches
// only those and two people's changes to one mark's words keep each other's characters.

/** Where the words differ, by UTF-16 unit as a text type counts: remove `remove` units at `at`, then insert `insert`. */
export type WordsDiff = { readonly at: number; readonly remove: number; readonly insert: string };

const isHigh = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;
const isLow = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;

/** The change from `before` to `after` between their common start and common end; null where they are the same. */
export function wordsDiff(before: string, after: string): WordsDiff | null {
  if (before === after) return null;
  const most = Math.min(before.length, after.length);
  let start = 0;
  while (start < most && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  // A pair of surrogates is one character: never begin inside one.
  if (start > 0 && isHigh(before.charCodeAt(start - 1))) start--;
  let end = 0;
  while (
    end < most - start &&
    before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)
  )
    end++;
  // Nor end inside one.
  if (end > 0 && isLow(before.charCodeAt(before.length - end))) end--;
  return {
    at: start,
    remove: before.length - start - end,
    insert: after.slice(start, after.length - end),
  };
}
