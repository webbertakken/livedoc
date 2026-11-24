'use client';

// Dragging a sheet tab along the sheet bar (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D176): a
// press moved more than 4 px drags the tab; a line shows where it lands, between the tabs nearest the pointer; letting
// go moves it there, and Escape, or letting go where it was, moves nothing.
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import { debugLog } from '@/lib/debug-log';

// How far a press travels before it is a drag, in px (D176).
export const SHEET_TAB_DRAG_PX = 4;

type Press = { tabId: string; x: number; dragging: boolean; slot: number };

/** Where a tab let go at `slot` (0: before the first tab) goes: after that tab, null for first; undefined: stays. */
export function tabDropAfter(
  ids: readonly string[],
  tabId: string,
  slot: number,
): string | null | undefined {
  const at = ids.indexOf(tabId);
  if (slot === at || slot === at + 1) return undefined;
  return slot === 0 ? null : ids[slot - 1]!;
}

export function useSheetTabDrag({
  list,
  ids,
  canDrag,
  onMove,
}: {
  list: RefObject<HTMLElement | null>;
  ids: readonly string[];
  canDrag: boolean;
  onMove: (tabId: string, after: string | null) => void;
}): {
  onPointerDown: (tabId: string, e: PointerEvent) => void;
  dragging: string | null;
  // The landing line's left edge, in px from the list's.
  lineX: number | null;
} {
  const press = useRef<Press | null>(null);
  const [drag, setDrag] = useState<{ tabId: string; lineX: number } | null>(null);
  const latest = useLatest({ ids, onMove });

  useEffect(() => {
    if (!drag) return;
    const end = () => {
      press.current = null;
      setDrag(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      debugLog('[workbook] sheet tab drag cancelled', {});
      end();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const slotAt = (x: number): { slot: number; lineX: number } => {
    const root = list.current!;
    const left = root.getBoundingClientRect().left;
    const boxes = [...root.querySelectorAll<HTMLElement>('[data-sheet-tab-face]')].map((el) =>
      el.getBoundingClientRect(),
    );
    const slot = boxes.filter((b) => b.left + b.width / 2 < x).length;
    // A drag starts on a tab, so there is always one: past the last, the line is at its right.
    const edge = slot < boxes.length ? boxes[slot]!.left : boxes[boxes.length - 1]!.right;
    return { slot, lineX: edge - left };
  };

  const onPointerDown = (tabId: string, e: PointerEvent) => {
    if (!canDrag || e.button !== 0) return;
    press.current = { tabId, x: e.clientX, dragging: false, slot: -1 };
    const move = (ev: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.dragging && Math.abs(ev.clientX - p.x) <= SHEET_TAB_DRAG_PX) return;
      p.dragging = true;
      const { slot, lineX } = slotAt(ev.clientX);
      p.slot = slot;
      setDrag({ tabId: p.tabId, lineX });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const p = press.current;
      press.current = null;
      setDrag(null);
      if (!p?.dragging) return;
      const after = tabDropAfter(latest.current.ids, p.tabId, p.slot);
      debugLog('[workbook] sheet tab dropped', {
        tabId: p.tabId,
        slot: p.slot,
        moved: after !== undefined,
      });
      if (after !== undefined) latest.current.onMove(p.tabId, after);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { onPointerDown, dragging: drag?.tabId ?? null, lineX: drag?.lineX ?? null };
}
