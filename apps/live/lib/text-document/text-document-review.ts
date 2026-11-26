// Reviewing suggestions (docs/specs/034-text-documents/review.md "Reviewing suggestions"): the Suggested edits panel's
// count, of the whole document and of each document tab holding any, and where Previous and Next go across tabs.

/** A suggestion as the panel reads it: its id and the document tab it is in. */
export type ReviewEntry = { readonly id: string; readonly tab: string };

/** The panel's count: the whole document's, and each tab's holding any, in the tabs' order. */
export type ReviewCount = {
  readonly total: number;
  readonly tabs: readonly { readonly id: string; readonly name: string; readonly count: number }[];
};

export function reviewCount(
  list: readonly ReviewEntry[],
  tabs: readonly { readonly id: string; readonly name: string }[],
): ReviewCount {
  return {
    total: list.length,
    tabs: tabs
      .map((t) => ({ id: t.id, name: t.name, count: list.filter((e) => e.tab === t.id).length }))
      .filter((t) => t.count > 0),
  };
}

/** The count as the panel says it (default copy). */
export const reviewCountLine = (count: number): string =>
  count === 0
    ? 'No suggested edits'
    : count === 1
      ? '1 suggested edit'
      : `${count} suggested edits`;

/**
 * Where Previous or Next goes: `local`, the shown tab's next or previous suggestion, when there is one; else the first
 * suggestion of the next tab holding any (forward) or the last of the previous one (backward); null past the ends.
 */
export function reviewStepTarget(
  list: readonly ReviewEntry[],
  tabs: readonly string[],
  shown: string,
  local: string | null,
  forward: boolean,
): ReviewEntry | null {
  if (local) return { id: local, tab: shown };
  const at = tabs.indexOf(shown);
  const beyond = list.filter((e) => {
    const index = tabs.indexOf(e.tab);
    return forward ? index > at : index < at;
  });
  return (forward ? beyond[0] : beyond.at(-1)) ?? null;
}
