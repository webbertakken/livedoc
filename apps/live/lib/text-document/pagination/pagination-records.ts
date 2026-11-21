// The pages the layout gives as it builds them (docs/specs/034-text-documents/page-layout.md "Laying out", "Columns"):
// a page being filled holds its column starts, spacers, boxes of columns and lines between as lists it adds to; a
// page laid is frozen to a PageStart, shifted when the layout takes it from before a change, and thawed to lay again.
import type { ColumnStart, Cross, PageStart, RegionRule, Spacer } from './pagination';

export type PageRecord = {
  block: number;
  line: number;
  gap: number;
  blank: number;
  carried?: true;
  columns: ColumnStart[];
  spacers: Spacer[];
  crosses: Cross[];
  rules: RegionRule[];
};

export const copyPage = (page: PageRecord): PageRecord => ({
  ...page,
  columns: [...page.columns],
  spacers: [...page.spacers],
  crosses: page.crosses.map((c) => ({ ...c, splits: [...c.splits] })),
  rules: [...page.rules],
});

/** The page to lay out again from: the one before the page holding block `target`'s start, never one a box carries. */
export function restartPage(starts: readonly PageStart[], target: number): number {
  let holding = 0;
  for (let q = 0; q < starts.length; q++) {
    const start = starts[q]!;
    if (start.block < target || (start.block === target && start.line === 0)) holding = q;
    else break;
  }
  // A page's start may have moved back for a block after it (keep with next): lay out the page before it too.
  let restart = Math.max(0, holding - 1);
  while (restart > 0 && starts[restart]!.carried) restart -= 1;
  return restart;
}

export const shifted = (start: PageStart, delta: number): PageStart => ({
  ...start,
  block: start.block + delta,
  ...(start.columns && { columns: start.columns.map((c) => ({ ...c, block: c.block + delta })) }),
  ...(start.spacers && { spacers: start.spacers.map((c) => ({ ...c, block: c.block + delta })) }),
  ...(start.crosses && { crosses: start.crosses.map((c) => ({ ...c, block: c.block + delta })) }),
  ...(start.rules && { rules: start.rules.map((c) => ({ ...c, block: c.block + delta })) }),
});

export function frozen(page: PageRecord): PageStart {
  const { columns, spacers, crosses, rules, carried, ...start } = page;
  return {
    ...start,
    ...(carried ? { carried } : {}),
    ...(columns.length > 0 ? { columns } : {}),
    ...(spacers.length > 0 ? { spacers } : {}),
    ...(crosses.length > 0 ? { crosses } : {}),
    ...(rules.length > 0 ? { rules } : {}),
  };
}

export const thawed = (start: PageStart): PageRecord => ({
  block: start.block,
  line: start.line,
  gap: start.gap,
  blank: start.blank,
  ...(start.carried ? { carried: true as const } : {}),
  columns: [...(start.columns ?? [])],
  spacers: [...(start.spacers ?? [])],
  crosses: (start.crosses ?? []).map((c) => ({ ...c, splits: [...c.splits] })),
  rules: [...(start.rules ?? [])],
});
