// The import report's way to the spreadsheet a file made (docs/specs/029-sheets/files-and-print.md "The import
// report", D120): File › Open goes to the new spreadsheet with a page load, so the report waits in sessionStorage
// under the spreadsheet's id, its lines already worded, until the person closes it, so it shows once.
import { debugLog } from '@/lib/debug-log';

/** A report waiting to be shown: the spreadsheet's name and the lines to list. */
export type KeptImportReport = { name: string; lines: string[] };

const KEY = (documentId: string) => `livedoc:import-report:${documentId}`;

/** Leave the report for the spreadsheet `documentId`; a page that refuses storage shows none, and says so. */
export function keepImportReport(documentId: string, report: KeptImportReport): void {
  try {
    sessionStorage.setItem(KEY(documentId), JSON.stringify(report));
  } catch (error) {
    debugLog('[workbook] import report not kept', { error: String(error) });
  }
}

const isReport = (value: unknown): value is KeptImportReport => {
  if (typeof value !== 'object' || value === null) return false;
  const { name, lines } = value as Partial<Record<keyof KeptImportReport, unknown>>;
  return (
    typeof name === 'string' &&
    Array.isArray(lines) &&
    lines.length > 0 &&
    lines.every((line) => typeof line === 'string')
  );
};

function parsed(stored: string, documentId: string): KeptImportReport | null {
  try {
    const value: unknown = JSON.parse(stored);
    if (isReport(value)) return value;
  } catch {
    // Not JSON: as any value not of this shape, logged below.
  }
  debugLog('[workbook] import report unreadable', { documentId });
  return null;
}

// The last value read, so a render reads the same report until the stored one changes.
let last: { key: string; stored: string | null; report: KeptImportReport | null } | null = null;
const listeners = new Set<() => void>();

/** The report waiting for `documentId`, or null: the same object while it waits (a store's snapshot). */
export function waitingImportReport(documentId: string): KeptImportReport | null {
  const key = KEY(documentId);
  let stored: string | null;
  try {
    stored = sessionStorage.getItem(key);
  } catch {
    // Storage refused: nothing waits here, as nothing could be left.
    return null;
  }
  if (last?.key !== key || last.stored !== stored)
    last = { key, stored, report: stored === null ? null : parsed(stored, documentId) };
  return last.report;
}

/** The report closed: it shows no more. */
export function dismissImportReport(documentId: string): void {
  try {
    sessionStorage.removeItem(KEY(documentId));
  } catch (error) {
    debugLog('[workbook] import report not dismissed', { error: String(error) });
  }
  last = null;
  for (const listener of listeners) listener();
}

/** Called when a report is closed. */
export function subscribeImportReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
