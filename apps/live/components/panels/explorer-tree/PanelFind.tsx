'use client';

// The panel's find (docs/specs/013-workspace/explorer-structure.md "Find"): Ctrl F or Cmd F with the focus in the
// editor's Explorer panel, on a section listing documents, opens a field above the open folder's list that narrows it
// by name. Escape or its close button puts it away and the focus back where it was; a second press while in the field
// is the browser's find.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CloseIcon, SearchIcon } from '@livedoc/ui';
import { debugLog } from '@/lib/debug-log';
import { isFindShortcut } from '@/lib/find-shortcut';
import { track } from '@/lib/telemetry';

/** The editor's Explorer panel, by the id its tour step finds it with: focus anywhere in it counts. */
const PANEL_ROOT = '[data-tour-id="explorer"]';

export type PanelFind = {
  open: boolean;
  text: string;
  setText: (text: string) => void;
  close: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function usePanelFind(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  scope: string,
): PanelFind {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  // Another folder or section: the find is put away.
  const [shown, setShown] = useState(scope);
  if (shown !== scope) {
    setShown(scope);
    setOpen(false);
    setText('');
  }

  // Put away: once the folder is drawn whole again, the focus goes back to the row it came from (redrawn if the
  // find had narrowed it away, found again by its name), else the first row.
  const refocus = useRef(false);
  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
    setText('');
  }, []);
  useLayoutEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    const from = cameFrom.current;
    cameFrom.current = null;
    const rows = [...(root.current?.querySelectorAll<HTMLElement>('[data-pane-row]') ?? [])];
    const label = from?.getAttribute('aria-label');
    const back = from?.isConnected
      ? from
      : (rows.find((r) => label && r.getAttribute('aria-label') === label) ?? rows[0]);
    back?.focus();
  }, [open, root]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape in the field puts the find away, ahead of the panel's own Escape (which closes the panel): heard in
      // the capture phase on the window, before the document's.
      if (e.key === 'Escape' && inputRef.current && document.activeElement === inputRef.current) {
        e.preventDefault();
        close();
        return;
      }
      if (!isFindShortcut(e)) return;
      const panel = root.current?.closest(PANEL_ROOT) ?? root.current;
      const active = document.activeElement;
      if (!panel || !(active instanceof HTMLElement) || !panel.contains(active)) return;
      if (active === inputRef.current) return;
      e.preventDefault();
      cameFrom.current = active;
      setOpen(true);
      debugLog(`[panel-find] open scope=${scope}`);
      track('Explorer', 'Opened', 'PanelFind');
      // Already open: focus it again, words selected.
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, root, scope, close]);

  return { open: open && enabled, text, setText, close, inputRef };
}

export function PanelFindField({
  find,
  folderName,
  matches,
}: {
  find: PanelFind;
  folderName: string;
  /** How many rows match the words, or null while there are none typed. */
  matches: number | null;
}) {
  const { inputRef } = find;
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);
  return (
    <div className="flex h-field items-center gap-1 rounded-control border border-slate-200 bg-white pl-2 pr-0.5 transition-colors duration-micro focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/25 dark:border-slate-700 dark:bg-slate-800">
      <SearchIcon size={14} aria-hidden className="shrink-0 text-slate-500 dark:text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        value={find.text}
        onChange={(e) => find.setText(e.target.value)}
        aria-label={`Find in ${folderName}`}
        placeholder={`Find in ${folderName}`}
        className="min-w-0 flex-1 bg-transparent text-body text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
      />
      <span
        role="status"
        aria-live="polite"
        className="shrink-0 text-supporting text-slate-500 dark:text-slate-400"
      >
        {matches === null
          ? ''
          : matches === 0
            ? 'No matches'
            : `${matches} ${matches === 1 ? 'match' : 'matches'}`}
      </span>
      <button
        type="button"
        onClick={find.close}
        aria-label="Close find"
        className="inline-flex size-chip shrink-0 items-center justify-center rounded-control text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <CloseIcon size={14} aria-hidden />
      </button>
    </div>
  );
}
