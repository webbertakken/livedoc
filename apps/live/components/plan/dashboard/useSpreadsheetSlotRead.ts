'use client';

// A Spreadsheet slot's read, kept current while shown (spreadsheet-slot-read.ts): the spreadsheet's sheets, then its
// first sheet, each read as a figure's sheet is (linked-sheets, D505). Retry asks both again.
import { useCallback } from 'react';
import { retryLinkedRead } from './linked-sheets';
import {
  firstSheetIdOf,
  spreadsheetSlotRead,
  type SpreadsheetSlotRead,
} from './spreadsheet-slot-read';
import { useLinkedRead } from './useLinkedSheetRead';

export function useSpreadsheetSlotRead(documentId: string): {
  read: SpreadsheetSlotRead;
  retry: () => void;
} {
  const sheets = useLinkedRead(documentId, '');
  const firstId = firstSheetIdOf(sheets);
  // Nothing asked for the sheet until the sheets read names it.
  const first = useLinkedRead(firstId ? documentId : '', firstId);
  const retry = useCallback(() => {
    retryLinkedRead(documentId, '');
    if (firstId) retryLinkedRead(documentId, firstId);
  }, [documentId, firstId]);
  return { read: spreadsheetSlotRead(sheets, first), retry };
}
