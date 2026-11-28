'use client';

// A form's responses into a spreadsheet (docs/specs/029-sheets/plan-links.md "Form responses", D506): choosing a
// sheet of one, or New Spreadsheet, connects the form to it with the Editor's own access before the form names it, so
// a spreadsheet they may not edit is refused before anything changes. Whenever the form's spreadsheet changes (a
// choice, an undo, another Editor), the new one is connected and the old one's connection taken back, best effort and
// logged: the form writes only where it names, and each response checks the connection. The sheet is read as a
// dashboard reads one, so the builder says when it was removed or cannot be opened.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isSpreadsheetSheet,
  type DestinationProblem,
  type FormDefinition,
  type FormSpreadsheetSheet,
} from '@livedoc/forms';
import { makeSheetId, workbookSheetLayout } from '@livedoc/sheets';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { connectFormToSheet, unlinkFormFromSheet } from '@/lib/api/workbook-link';
import { debugLog } from '@/lib/debug-log';
import { useLatest } from '@/hooks/ui/useLatest';
import { newSheetTab, workbookMadeHere } from '@/lib/spreadsheet/spreadsheet-document';
import type { LinkedRead } from '@/components/plan/dashboard/linked-sheets';
import { useLinkedRead } from '@/components/plan/dashboard/useLinkedSheetRead';

/** A new responses spreadsheet's one sheet, as Google names it. */
export const RESPONSES_SHEET_NAME = 'Form Responses 1';
/** A spreadsheet's longest name (the api's cap on a document's). */
const SPREADSHEET_NAME_MAX = 80;

export const CONNECT_REFUSED =
  'Responses can only go to a spreadsheet you can edit. Choose another, or make a new one.';
export const CONNECT_FAILED = 'The form couldn’t be connected to that spreadsheet. Try again.';
export const MAKE_FAILED = 'The spreadsheet couldn’t be made. Try again.';

export type FormSpreadsheet = {
  // The spreadsheet's read while the form sends to one; null otherwise.
  read: LinkedRead | null;
  // "<Sheet> · <Spreadsheet>" once read.
  name: string | null;
  problem: DestinationProblem | null;
  // Connecting or making one: the choices wait.
  busy: boolean;
  failure: string | null;
  choose: (to: { documentId: string; sheetId: string }) => Promise<void>;
  makeNew: () => Promise<void>;
};

type Place = { folderId?: string };

const keyOf = (sheet: FormDefinition['sheet']): string =>
  isSpreadsheetSheet(sheet) ? `${sheet.documentId}/${sheet.sheetId}` : '';

/** What a refused connection says: no edit access, or that it failed. */
function connectFailure(error: unknown): string {
  return error instanceof ApiError && (error.status === 403 || error.status === 404)
    ? CONNECT_REFUSED
    : CONNECT_FAILED;
}

/** The problem the builder shows for a spreadsheet's sheet, from its read: none while it loads. */
export function spreadsheetProblem(read: LinkedRead | null): DestinationProblem | null {
  if (!read) return null;
  if (read.state === 'denied') return 'spreadsheet_denied';
  if (read.state === 'ready' && !read.sheet) return 'sheet_missing';
  return null;
}

export function useFormSpreadsheet({
  form,
  formDocumentId,
  formTabId,
  ownerId,
  canEdit,
  place,
  setSheet,
}: {
  form: FormDefinition;
  formDocumentId: string | null;
  formTabId: string;
  ownerId: string;
  canEdit: boolean;
  // Where a new spreadsheet goes: the form's folder when the person keeps it, else their default folder.
  place: Place;
  setSheet: (to: FormSpreadsheetSheet) => void;
}): FormSpreadsheet {
  const at = isSpreadsheetSheet(form.sheet) ? form.sheet : null;
  const read = useLinkedRead(at?.documentId ?? '', at?.sheetId ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The spreadsheet sheet last connected from here (or found on opening), so a change is connected once.
  const connected = useRef<FormSpreadsheetSheet | null>(at);

  const connect = useCallback(
    async (to: FormSpreadsheetSheet) => {
      if (!formDocumentId) throw new Error('form not on the server');
      await connectFormToSheet(ownerId, to.documentId, {
        documentId: formDocumentId,
        tabId: formTabId,
        sheetId: to.sheetId,
      });
      debugLog('[forms] form.spreadsheet.connected', {});
    },
    [formDocumentId, formTabId, ownerId],
  );

  // The form's old spreadsheet, when it moves to another document (the same one moves its connection itself).
  const leave = useCallback(
    (from: FormSpreadsheetSheet | null, to: FormSpreadsheetSheet | null) => {
      if (!from || !formDocumentId || from.documentId === to?.documentId) return;
      unlinkFormFromSheet(ownerId, from.documentId, {
        documentId: formDocumentId,
        tabId: formTabId,
      }).catch((error: unknown) =>
        console.warn('[forms] form.spreadsheet.unlink_failed', { reason: String(error) }),
      );
    },
    [formDocumentId, formTabId, ownerId],
  );

  // Any change of the form's spreadsheet not made here (an undo, another Editor's choice) is connected, as made here.
  const key = keyOf(form.sheet);
  const latest = useLatest(at);
  useEffect(() => {
    if (keyOf(connected.current ?? undefined) === key) return;
    const from = connected.current;
    const to = latest.current;
    connected.current = to;
    if (!canEdit) return;
    leave(from, to);
    if (to)
      connect(to).catch((error: unknown) =>
        console.warn('[forms] form.spreadsheet.reconnect_failed', { reason: String(error) }),
      );
  }, [key, canEdit, connect, leave, latest]);

  const choose = useCallback<FormSpreadsheet['choose']>(
    async (to) => {
      const next = { documentId: to.documentId, sheetId: to.sheetId };
      setBusy(true);
      setFailure(null);
      try {
        await connect(next);
      } catch (error) {
        console.warn('[forms] form.spreadsheet.connect_refused', { reason: String(error) });
        setFailure(connectFailure(error));
        setBusy(false);
        return;
      }
      leave(connected.current, next);
      connected.current = next;
      setSheet(next);
      setBusy(false);
    },
    [connect, leave, setSheet],
  );

  const makeNew = useCallback<FormSpreadsheet['makeNew']>(async () => {
    const documentId = crypto.randomUUID();
    const tabId = crypto.randomUUID();
    const sheetId = makeSheetId();
    setBusy(true);
    setFailure(null);
    let made = false;
    try {
      await apiCreateDocument(ownerId, {
        id: documentId,
        name: `${form.heading} Responses`.slice(0, SPREADSHEET_NAME_MAX),
        tabs: [newSheetTab(tabId, RESPONSES_SHEET_NAME)],
        sheets: [
          { id: sheetId, tabId, title: RESPONSES_SHEET_NAME, layout: workbookSheetLayout() },
        ],
        workbook: workbookMadeHere(),
        ...(place.folderId !== undefined ? { folderId: place.folderId } : {}),
      });
      made = true;
      const next = { documentId, sheetId };
      await connect(next);
      leave(connected.current, next);
      connected.current = next;
      setSheet(next);
      debugLog('[forms] form.spreadsheet.made', {});
    } catch (error) {
      console.warn('[forms] form.spreadsheet.make_failed', { made, reason: String(error) });
      // A spreadsheet made but not connected is binned, so nothing half-made is left behind.
      if (made)
        await apiDeleteDocument(ownerId, documentId).catch((e: unknown) =>
          console.warn('[forms] form.spreadsheet.unbinned', { reason: String(e) }),
        );
      setFailure(MAKE_FAILED);
    } finally {
      setBusy(false);
    }
  }, [connect, leave, form.heading, ownerId, place.folderId, setSheet]);

  const shown = at ? read : null;
  const name =
    shown?.state === 'ready' && shown.sheet
      ? `${shown.sheets.find((s) => s.id === shown.sheet!.id)?.title ?? shown.sheet.title} · ${shown.name}`
      : null;
  return useMemo(
    () => ({
      read: shown,
      name,
      problem: spreadsheetProblem(shown),
      busy,
      failure,
      choose,
      makeNew,
    }),
    [shown, name, busy, failure, choose, makeNew],
  );
}
