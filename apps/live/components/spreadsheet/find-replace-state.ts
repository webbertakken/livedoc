'use client';

// Find and Replace's state (docs/specs/029-sheets/data-tools.md "Find and replace"): whether the dialog is open, what
// was typed and chosen, its last words and the match it is on, held by the spreadsheet's surface so it stays open
// and keeps its fields as Find goes from sheet to sheet (each sheet's parts mount afresh), with the sheet bar's tabs:
// the shown ones Find steps through, every one Replace All reaches.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { FindOptions, FoundMatch } from '@livedoc/sheets';

export type FindSearch = 'all' | 'sheet' | 'range';

export type FindReplaceFields = {
  find: string;
  by: string;
  search: FindSearch;
  // Specific Range's text; null until typed, the selection meanwhile.
  range: string | null;
  opts: FindOptions;
};

export type FindReplaceState = {
  open: boolean;
  fields: FindReplaceFields;
  // The line under the options: a loop, no results, how many were replaced.
  status: string;
  // The match Find last went to, which Replace replaces.
  at: FoundMatch | null;
  // Opens the dialog, with the Find bar's text when it gave one.
  openWith: (find?: string) => void;
  close: () => void;
  change: (patch: Partial<FindReplaceFields>) => void;
  settle: (status: string, at?: FoundMatch | null) => void;
  // The sheet bar's tabs, in order: those shown, and all of them.
  shownTabIds: readonly string[];
  allTabIds: readonly string[];
};

const EMPTY: FindReplaceFields = { find: '', by: '', search: 'all', range: null, opts: {} };

export function useFindReplaceState(
  shownTabIds: readonly string[],
  allTabIds: readonly string[],
): FindReplaceState {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [status, setStatus] = useState('');
  const [at, setAt] = useState<FoundMatch | null>(null);
  const openWith = useCallback((find?: string) => {
    if (find !== undefined) setFields((f) => ({ ...f, find }));
    setStatus('');
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setAt(null);
  }, []);
  const change = useCallback((patch: Partial<FindReplaceFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    // A new search starts again: its words and its match belonged to the old one.
    setStatus('');
    setAt(null);
  }, []);
  const settle = useCallback((next: string, match?: FoundMatch | null) => {
    setStatus(next);
    if (match !== undefined) setAt(match);
  }, []);
  return useMemo(
    () => ({
      open,
      fields,
      status,
      at,
      openWith,
      close,
      change,
      settle,
      shownTabIds,
      allTabIds,
    }),
    [open, fields, status, at, openWith, close, change, settle, shownTabIds, allTabIds],
  );
}

export const FindReplaceContext = createContext<FindReplaceState | null>(null);

export function useFindReplace(): FindReplaceState | null {
  return useContext(FindReplaceContext);
}
