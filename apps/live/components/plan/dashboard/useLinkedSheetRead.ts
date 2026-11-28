'use client';

// A figure's sheet, wherever it is (docs/specs/029-sheets/plan-links.md "Dashboards"): a sheet of a spreadsheet, read
// through the api (linked-sheets), when the figure names one; else a Plan Sheet of the dashboard's own document
// (useSheetRead). Both answer as a SheetRead, so a slot draws either alike.
import { useCallback, useSyncExternalStore } from 'react';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';
import { tabsStateOf, useDashboard } from './dashboard-context';
import { linkedRead, retryLinkedRead, subscribeLinkedRead, type LinkedRead } from './linked-sheets';
import { useSheetRead, type SheetRead } from './useSheetReader';

const NO_LINK: LinkedRead = { state: 'loading' };
const noop = () => () => {};

/** A spreadsheet's read, kept current while shown; loading outside the editor's sheets bridge. `sheetId` '' reads
 * the workbook's sheets alone; `documentId` '' reads nothing. */
export function useLinkedRead(documentId: string, sheetId: string): LinkedRead {
  const ownerId = useSheetsBridgeContext()?.scope.ownerId ?? '';
  const on = !!ownerId && !!documentId;
  const subscribe = useCallback(
    (listener: () => void) => subscribeLinkedRead(ownerId, documentId, sheetId, listener),
    [ownerId, documentId, sheetId],
  );
  const snapshot = useCallback(() => linkedRead(documentId, sheetId), [documentId, sheetId]);
  const read = useSyncExternalStore(on ? subscribe : noop, snapshot, snapshot);
  return on ? read : NO_LINK;
}

/** A linked read as a figure reads its sheet; `name` is said while it loads or fails. */
export function asSheetRead(
  read: LinkedRead,
  documentId: string,
  sheetId: string,
  name: string,
): SheetRead {
  switch (read.state) {
    case 'ready':
      return read.sheet
        ? {
            state: 'ready',
            sheet: read.sheet,
            wb: read.wb,
            locale: read.locale,
            version: read.version,
          }
        : { state: 'gone' };
    case 'failed':
      return { state: 'failed', name, retry: () => retryLinkedRead(documentId, sheetId) };
    case 'loading':
      return { state: 'loading', name };
    default:
      return read;
  }
}

/** The sheet a figure reads: its spreadsheet's when it names one, else the dashboard's own document's. */
export function useFigureSheetRead(content: { documentId?: string; sheetId: string }): SheetRead {
  const { tabs, tabStatus, loadAllTabs } = useDashboard();
  const documentId = content.documentId ?? '';
  const linked = useLinkedRead(documentId, documentId ? content.sheetId : '');
  // Only the one in use asks for anything: an empty sheet id reads none.
  const own = useSheetRead(
    documentId ? '' : content.sheetId,
    tabs,
    tabsStateOf(tabs, tabStatus),
    loadAllTabs,
  );
  if (!documentId) return own;
  if (!content.sheetId) return { state: 'none' };
  return asSheetRead(linked, documentId, content.sheetId, 'the sheet');
}
