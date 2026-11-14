'use client';

import { useEffect } from 'react';
import { useOptionalSelectionStore } from '@/hooks/canvas/useSelectionStore';
import { clearContextSelection } from '@/lib/context-selection';

// The context selection lets go (docs/specs/021-event-storming/candidate-contexts.md "Selecting several and merging"):
// on Escape, on a press anywhere but a context, its merge offer or the Draw Context pen, and when an element is
// selected. Letting go puts the pen away too. Listening only
// while something is selected.
export function useClearContextSelection(tabId: string, active: boolean): void {
  const store = useOptionalSelectionStore();
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        target?.closest?.(
          '[data-candidate-context],[data-context-merge],[data-context-pen],[data-context-pen-toggle]',
        )
      )
        return;
      clearContextSelection(tabId);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // A name being typed takes its own Escape (it puts the old name back).
      if (e.key === 'Escape' && (e.target as Element | null)?.tagName !== 'INPUT')
        clearContextSelection(tabId);
    };
    const onElementSelected = () => {
      const s = store?.get();
      if (s && (s.selectedId !== null || s.multiSelectedIds.size > 0)) clearContextSelection(tabId);
    };
    // Capture: a context's own keys stop their events from bubbling.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    const unsubscribe = store?.subscribe(onElementSelected);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      unsubscribe?.();
    };
  }, [tabId, active, store]);
}
