// The person's pick of the sheet bar's summary (docs/specs/029-sheets/surface.md "Sheet bar"): one kind, kept in their
// browser and shared by every spreadsheet on the page; Sum until they pick another.
import { useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';
import { SUMMARY_KINDS, type SummaryKind } from './selection-summary';

const PICK_KEY = 'livedoc:spreadsheet-summary';
const DEFAULT_PICK: SummaryKind = 'Sum';

let pick: SummaryKind | null = null;
const listeners = createListeners();

// No storage, or a value that is no kind: Sum.
function read(): SummaryKind {
  const raw = readLocalStorageSafe(PICK_KEY);
  return SUMMARY_KINDS.find((kind) => kind === raw) ?? DEFAULT_PICK;
}

export function summaryPick(): SummaryKind {
  pick ??= read();
  return pick;
}

export function setSummaryPick(kind: SummaryKind): void {
  pick = kind;
  // A blocked write keeps the pick for this page only.
  writeLocalStorageSafe(PICK_KEY, kind);
  listeners.notify();
}

export function useSummaryPick(): SummaryKind {
  return useSyncExternalStore(listeners.subscribe, summaryPick, () => DEFAULT_PICK);
}

// For tests: forget the pick read so far.
export function resetSummaryPick(): void {
  pick = null;
}
