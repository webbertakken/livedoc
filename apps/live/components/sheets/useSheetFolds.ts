// Collapsing and expanding for oneself (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline", D163): a
// Participant's and a Viewer's folds are kept for this session only, never saved or sent, laid over the sheet's own.
// An Editor's folds are writes, so for them the sheet's layout is the one drawn.
import { useCallback, useMemo, useState } from 'react';
import { withFolds, type FoldChange, type SheetLayout } from '@livedoc/sheets';

type Folds = { sheetId: string; byMark: ReadonlyMap<string, FoldChange> };

export function useSheetFolds(sheetId: string, layout: SheetLayout, canShape: boolean) {
  const [folds, setFolds] = useState<Folds>({ sheetId, byMark: new Map() });
  // Another sheet in the same place starts with none of this one's.
  const viewLayout = useMemo(
    () =>
      withFolds(layout, !canShape && folds.sheetId === sheetId ? [...folds.byMark.values()] : []),
    [layout, folds, canShape, sheetId],
  );
  // The latest fold of each group's mark stands.
  const foldForSelf = useCallback(
    (changes: readonly FoldChange[]) =>
      setFolds((prev) => {
        const byMark = new Map(prev.sheetId === sheetId ? prev.byMark : []);
        for (const ch of changes) byMark.set(`${ch.axis}|${ch.at}|${ch.depth}`, ch);
        return { sheetId, byMark };
      }),
    [sheetId],
  );
  return { viewLayout, foldForSelf };
}
