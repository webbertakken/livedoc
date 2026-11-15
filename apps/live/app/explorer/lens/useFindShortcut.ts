'use client';

// Ctrl F (Cmd F) on an Explorer page puts the caret in the top-bar search, its words selected
// (docs/specs/013-workspace/explorer-filters.md "The field"): in-page find cannot see a long list's rows that are not
// drawn, the search finds every one. Pressed while the search has the focus, or with a dialog open, it is the
// browser's find.
import { useEffect, type RefObject } from 'react';
import { debugLog } from '@/lib/debug-log';
import { isFindShortcut } from '@/lib/find-shortcut';

const OPEN_DIALOG = '[role="dialog"][aria-modal="true"], dialog[open]';

export function useFindShortcut(field: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = field.current;
      if (!el || !isFindShortcut(e) || document.activeElement === el) return;
      if (document.querySelector(OPEN_DIALOG)) return;
      e.preventDefault();
      el.focus();
      el.select();
      debugLog('[explorer-find] focus-search');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [field]);
}
