// The tool finder's search (docs/specs/004-interface-design/office-shell.md "Tool finder"): every word typed must
// start a word of the item's label, keywords or menu path; labels that start with what was typed come first, then
// the catalogue's own order. Nothing typed finds nothing.
import type { FoundItem } from './office-catalogue';
import { everyWordStarts, wordsOf } from './word-match';

export const TOOL_FINDER_MAX_RESULTS = 12;

export function findTools(items: readonly FoundItem[], query: string, max: number): FoundItem[] {
  if (wordsOf(query).length === 0) return [];
  const start = query.trim().toLowerCase();
  const matched = items.filter(({ item, path }) =>
    everyWordStarts(query, [item.label, ...(item.keywords ?? []), ...path].join(' ')),
  );
  const first = matched.filter(({ item }) => item.label.toLowerCase().startsWith(start));
  const rest = matched.filter(({ item }) => !item.label.toLowerCase().startsWith(start));
  return [...first, ...rest].slice(0, max);
}
