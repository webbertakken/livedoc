'use client';

// Read mode (docs/specs/035-pdf-documents/reading-surface.md "Read mode"): one person's room for the pages, the menu
// bar, the toolbar and the side panels hidden. Kept while the surface is open, never remembered; Escape leaves where
// nothing nearer took it, and entering it is told to telemetry.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { READ_MODE } from './pdf-menus';

export function usePdfReadMode() {
  const [on, setOn] = useState(false);

  const set = useCallback((next: boolean) => {
    setOn(next);
    debugLog(`[pdf] read-mode on=${next ? 'yes' : 'no'}`);
    if (next) track('Pdf', 'Toggled', 'ReadMode');
  }, []);

  const leave = useCallback(() => set(false), [set]);

  const actions: OfficeActions = useMemo(
    () => ({ [READ_MODE]: { run: () => set(!on), checked: on } }),
    [on, set],
  );

  /** Escape, heard by the surface: true where it left Read mode. */
  const onKey = useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      if (!on || event.key !== 'Escape' || event.defaultPrevented) return false;
      event.preventDefault();
      leave();
      return true;
    },
    [on, leave],
  );

  return { on, actions, onKey, leave };
}
