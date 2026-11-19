// An offline document's sheet store (docs/specs/029-sheets/sheet-store.md "Offline documents"): the sheets live in
// the document's own record, and every write is the same pure transition the api applies (@livedoc/sheets
// applySheetWrite), validated the same way, serialised with the record's other writes. Loaded only for an offline
// document (lib/api/sheets.ts), as it carries the engine.

import { debugLog } from '@/lib/debug-log';
import type {
  SheetCreateRequest,
  SheetWriteRequest,
  SheetWriteResponse,
} from '@livedoc/api-schema';
import {
  SheetLimits,
  SheetName,
  applySheetWrite,
  cellKey,
  cellToJson,
  emptyLayout,
  makeSheetId,
  sheetFromJson,
  sheetToJson,
  validateSheetCreate,
  validateWrite,
  type SheetJson,
  type SheetNameRefusal,
  type SheetPerson,
} from '@livedoc/sheets';
import { ApiError } from '../api/core';
import {
  offlineGetRecord,
  offlineUpdateRecord,
  serializeOfflineWrite,
  type OfflineDocumentRecord,
} from './offline-store';

// What a change sees of the record: its sheets, and whether they are a spreadsheet's (its workbook row), with the
// sheets on its tabs in tab order (a deleted tab's sheet is kept for Undo but is in no workbook).
type SheetsRecord = { sheets: SheetJson[]; spreadsheet: boolean; onTabs: SheetJson[] };

// A change's answer: the new sheet list (null for none), a sheet tab's new name (a spreadsheet's sheet renamed), and
// what the caller returns.
type SheetsChange<T> = {
  sheets: SheetJson[] | null;
  tabName?: { tabId: string; name: string };
  answer: T;
};

function onTabs(rec: OfflineDocumentRecord): SheetJson[] {
  const at = new Map(rec.tabs.map((t, i) => [t.id, i]));
  return (rec.sheets ?? [])
    .filter((s) => at.has(s.tabId))
    .sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!);
}

// Rewrite a live record's sheets in one transaction (offlineUpdateRecord): `change` answers the
// new sheet list and what the caller returns, or throws to write nothing.
async function updateSheets<T>(
  documentId: string,
  change: (rec: SheetsRecord) => SheetsChange<T>,
): Promise<T> {
  let out = null as { answer: T } | null;
  await offlineUpdateRecord(documentId, (rec: OfflineDocumentRecord | undefined) => {
    if (!rec || rec.trashedAt !== undefined) throw new ApiError('sheet write', 404, 'not_found');
    const next = change({
      sheets: rec.sheets ?? [],
      spreadsheet: rec.workbook !== undefined,
      onTabs: onTabs(rec),
    });
    out = { answer: next.answer };
    if (!next.sheets) return undefined;
    const named = next.tabName;
    const tabs = named
      ? rec.tabs.map((t) => (t.id === named.tabId ? { ...t, name: named.name } : t))
      : rec.tabs;
    return { ...rec, tabs, sheets: next.sheets };
  });
  // The change ran (or threw): a resolved update always read the record.
  return out!.answer;
}

export async function offlineFetchSheets(
  documentId: string,
  which: { tabId: string } | { ids: readonly string[] } | null,
): Promise<SheetJson[]> {
  const rec = await offlineGetRecord(documentId);
  // A spreadsheet's sheets are its tabs', in tab order, as the api answers them.
  const sheets = rec?.workbook ? onTabs(rec) : (rec?.sheets ?? []);
  if (!which) return sheets;
  if ('tabId' in which) return sheets.filter((s) => s.tabId === which.tabId);
  const ids = new Set(which.ids);
  return sheets.filter((s) => ids.has(s.id));
}

export async function offlineCreateSheet(
  documentId: string,
  create: SheetCreateRequest,
  by: SheetPerson,
): Promise<SheetJson> {
  return serializeOfflineWrite(async () => {
    const { sheet, wrote } = await updateSheets(documentId, ({ sheets, spreadsheet, onTabs }) => {
      const limits = SheetLimits.of(spreadsheet);
      const id = create.id ?? makeSheetId();
      const stored = sheets.find((s) => s.id === id);
      // A restore (the editor's undo) of a sheet still here keeps it, as the api does.
      if (stored && create.restore && stored.tabId === create.tabId)
        return { sheets: null, answer: { sheet: stored, wrote: false } };
      if (stored) throw new ApiError('sheet create', 409, 'sheet_exists');
      // A spreadsheet's names are its workbook's, by the sheet name's rules; a Plan Sheet's unique on its tab.
      if (spreadsheet) {
        const named = SheetName.check(
          create.title,
          onTabs.map((s) => s.title),
        );
        if (!named.ok) throw new ApiError('sheet create', nameStatus(named.refusal), named.refusal);
      } else {
        const lower = create.title.toLowerCase();
        if (sheets.some((s) => s.tabId === create.tabId && s.title.toLowerCase() === lower))
          throw new ApiError('sheet create', 409, 'sheet_title_taken');
      }
      if (sheets.length >= limits.sheets) throw new ApiError('sheet create', 413, 'sheets_full');
      const now = Date.now();
      const source = create.copyOf ? sheets.find((s) => s.id === create.copyOf) : undefined;
      if (create.copyOf && !source) throw new ApiError('sheet create', 404, 'sheet_not_found');
      const made: SheetJson = {
        id,
        tabId: create.tabId,
        title: create.title,
        layout: source?.layout ?? create.layout ?? emptyLayout(),
        cells: source?.cells ?? create.cells ?? [],
        rev: 0,
        createdAt: now,
        updatedAt: now,
        updatedBy: by,
      };
      const check = validateSheetCreate(sheetFromJson(made), limits);
      if (!check.ok)
        throw new ApiError('sheet create', check.error === 'sheet_full' ? 413 : 400, check.error);
      if (spreadsheet) gridCheck([...onTabs, made], 'sheet create');
      return { sheets: [...sheets, made], answer: { sheet: made, wrote: true } };
    });
    if (wrote) debugLog('[sheets] sheets.offline.write', { kind: 'create' });
    return sheet;
  });
}

export async function offlineWriteSheet(
  documentId: string,
  sheetId: string,
  request: SheetWriteRequest,
  by: SheetPerson,
): Promise<SheetWriteResponse> {
  const write = request.write;
  return serializeOfflineWrite(async () => {
    const landed = await updateSheets(documentId, ({ sheets, spreadsheet, onTabs }) => {
      const at = sheets.findIndex((s) => s.id === sheetId);
      if (at < 0) throw new ApiError('sheet write', 404, 'sheet_not_found');
      const sheet = sheetFromJson(sheets[at]!);
      const limits = SheetLimits.of(spreadsheet);
      if (write.kind === 'title' && spreadsheet) {
        const named = SheetName.check(
          write.title,
          onTabs.filter((s) => s.id !== sheetId).map((s) => s.title),
        );
        if (!named.ok) throw new ApiError('sheet write', nameStatus(named.refusal), named.refusal);
      } else if (write.kind === 'title') {
        const lower = write.title.trim().toLowerCase();
        if (
          sheets.some(
            (s) => s.id !== sheetId && s.tabId === sheet.tabId && s.title.toLowerCase() === lower,
          )
        )
          throw new ApiError('sheet write', 409, 'sheet_title_taken');
      }
      // As the api: validation rules unless an undo or a write stored as it is (data-validation.md).
      const check = validateWrite(sheet, write, {
        checkRules: !request.undo && !request.unchecked,
        limits,
      });
      if (!check.ok)
        throw new ApiError('sheet write', check.error === 'sheet_full' ? 413 : 400, check.error);
      const result = applySheetWrite(
        sheet,
        write.kind === 'title' ? { ...write, title: write.title.trim() } : write,
        {
          now: Date.now(),
          by,
        },
      );
      const next = sheetToJson(result.sheet);
      if (spreadsheet && write.kind === 'layout')
        gridCheck(
          onTabs.map((s) => (s.id === sheetId ? next : s)),
          'sheet write',
        );
      return {
        sheets: sheets.map((s, i) => (i === at ? next : s)),
        // A spreadsheet's sheet tab is named as its sheet (docs/specs/029-sheets/spreadsheet.md "The workbook shape").
        ...(spreadsheet && result.applied.kind === 'title'
          ? { tabName: { tabId: next.tabId, name: next.title } }
          : {}),
        answer: result,
      };
    });
    debugLog('[sheets] sheets.offline.write', { kind: write.kind });
    const applied = landed.applied;
    const keys =
      applied.kind === 'title' ? [] : (applied.cells ?? []).map((c) => cellKey(c.r, c.c));
    return {
      applied,
      rev: landed.sheet.rev,
      cells: keys.map((k) => cellToJson(k, landed.sheet.cells.get(k))),
    };
  });
}

// A name taken is a conflict; one against the rules a bad request, as the api answers them.
const nameStatus = (refusal: SheetNameRefusal): number =>
  refusal === 'sheet_name_taken' ? 409 : 400;

// A spreadsheet's sheets past its rows or grid cells over every sheet, as the api refuses them (spreadsheet.md
// "Limits").
function gridCheck(sheets: readonly SheetJson[], action: string): void {
  const refusal = SheetLimits.workbookRefusal(
    SheetLimits.spreadsheet,
    sheets.map((s) => ({ rows: s.layout.rows.length, cols: s.layout.cols.length })),
  );
  if (refusal) throw new ApiError(action, 413, refusal);
}

// An offline document has no reference index: the editor deletes a sheet with its element only once it has found
// nothing else references it (sheet-references.ts), so a delete when unreferenced deletes at once.
export async function offlineDeleteSheet(documentId: string, sheetId: string): Promise<void> {
  return serializeOfflineWrite(() =>
    updateSheets(documentId, ({ sheets }) => {
      if (!sheets.some((s) => s.id === sheetId))
        throw new ApiError('sheet delete', 404, 'sheet_not_found');
      return { sheets: sheets.filter((s) => s.id !== sheetId), answer: undefined };
    }),
  );
}
