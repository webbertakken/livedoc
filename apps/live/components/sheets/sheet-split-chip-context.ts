// The Separator chip a split leaves on the grid (docs/specs/029-sheets/data-tools.md "Split Text to Columns"): its
// range and separator, held by the spreadsheet's split (useSplitText), drawn by the grid (SheetSplitChip). Absent
// where splitting is not offered (a Plan Sheet).
import { createContext, useContext } from 'react';
import type { GridRange, SplitSeparator } from '@livedoc/sheets';

export type SplitChip = {
  sheetId: string;
  range: GridRange;
  separator: SplitSeparator;
};

export type SplitChipValue = {
  chip: SplitChip | null;
  choose: (separator: SplitSeparator) => void;
  close: () => void;
};

export const SplitChipContext = createContext<SplitChipValue | null>(null);

export function useSplitChip(): SplitChipValue | null {
  return useContext(SplitChipContext);
}
