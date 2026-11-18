'use client';

// Point mode while a formula is typed (docs/specs/029-sheets/sheet.md "Editing"): a click or drag on a cell puts its
// reference into the draft at the caret, a drag growing it into a range; and while this sheet writes a formula, the
// other sheets of its document point into it. Shared by every view of a sheet.
import { useCallback, useEffect, useRef } from 'react';
import { formatA1, formatRange, normaliseRange, quoteSheet } from '@livedoc/sheets';
import { useLatest } from '@/hooks/ui/useLatest';
import { insertReference, referenceSlot } from './formula-assist';
import type { SheetController } from './sheet-controller';
import { clearPointingTarget, setPointingTarget } from './sheet-pointing';
import type { FormulaInput } from './useFormulaInput';
import type { PointRef } from './useSheetPointer';

export function useFormulaPointing(c: SheetController, input: FormulaInput): PointRef {
  // Where the last pointed reference sits in the draft, so a drag grows it into a range.
  const pointed = useRef<{ start: number; end: number } | null>(null);
  const pointRef = useCallback<PointRef>(
    (from, to, sheet) => {
      const e = c.editing;
      if (!e || !e.draft.startsWith('=')) return false;
      const slot =
        from.r === to.r && from.c === to.c ? referenceSlot(e.draft, input.caret) : pointed.current;
      if (!slot) return false;
      const cells =
        from.r === to.r && from.c === to.c
          ? formatA1(to.r, to.c)
          : formatRange(normaliseRange(from, to));
      const text = sheet ? `${quoteSheet(sheet)}!${cells}` : cells;
      const next = insertReference(e.draft, slot, text);
      pointed.current = next.slot;
      c.setEditing({ ...e, draft: next.draft });
      input.setCaret(next.caret);
      return true;
    },
    [c, input],
  );
  const latestPoint = useLatest(pointRef);
  const latestCaret = useLatest(input.caret);
  const writingFormula = !!c.editing?.draft.startsWith('=');
  useEffect(() => {
    if (!writingFormula) return;
    const id = c.sheet.id;
    setPointingTarget({
      sheetId: id,
      tabId: c.sheet.tabId,
      point: (from, to, sheet) => latestPoint.current(from, to, sheet),
      refocus: () => {
        const el = document.querySelector<HTMLTextAreaElement>(`[data-sheet-editor="${id}"]`);
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(latestCaret.current, latestCaret.current);
      },
    });
    return () => clearPointingTarget(c.sheet.id);
  }, [writingFormula, c.sheet.id, c.sheet.tabId, latestPoint, latestCaret]);
  return pointRef;
}
