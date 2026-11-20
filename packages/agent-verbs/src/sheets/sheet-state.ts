// What every sheet tool reads first (docs/specs/029-sheets/sheet-store.md "Agents"): the document's sheets, the one a
// call names (by title or id, never row or column ids), and a workbook over the sheets its formulas read (its tab's, or
// a spreadsheet's every sheet) so values are worked out by the engine the editor uses, Plan cards included when a
// formula reads them.
import type { ApiClient } from '@livedoc/api-client';
import type { DocumentResponse, ItemsResponse, SheetsResponse } from '@livedoc/api-schema';
import { cardSourceOf, readItemTypeCatalogue, typesOf } from '@livedoc/items';
import {
  AGENT_LOCALE,
  SheetLimits,
  sheetFromJson,
  Workbook,
  type SheetJson,
  type WorkbookRecord,
} from '@livedoc/sheets';
import { itemsPath } from '../verbs/shared';

export const sheetsPath = (documentId: string) =>
  `/documents/${encodeURIComponent(documentId)}/sheets`;

export const sheetWritesPath = (documentId: string, sheetId: string) =>
  `${sheetsPath(documentId)}/${encodeURIComponent(sheetId)}/writes`;

// A refusal a sheet tool words itself, with what there is.
export type SheetRefusal = { ok: false; code: string; message: string };

// Every sheet of the document, cells included (one request), or one tab's.
export async function readSheets(
  api: ApiClient,
  documentId: string,
  tabId?: string,
): Promise<SheetJson[]> {
  const query = tabId ? `?tabId=${encodeURIComponent(tabId)}` : '';
  return (await api.json<SheetsResponse>(`${sheetsPath(documentId)}${query}`)).sheets;
}

// The document's sheets, cells included, and its workbook row when it is a spreadsheet (one request).
export type SheetsState = { sheets: SheetJson[]; workbook: WorkbookRecord | null };

export async function readSheetsState(api: ApiClient, documentId: string): Promise<SheetsState> {
  const { sheets, workbook } = await api.json<SheetsResponse>(sheetsPath(documentId));
  return { sheets, workbook: workbook ?? null };
}

const listed = (sheets: readonly SheetJson[]) =>
  sheets.map((s) => `"${s.title}" (${s.id})`).join(', ');

// The sheet a call names: its title (case aside), its id, or an id prefix. A title two tabs share is refused with
// their ids.
export function resolveSheet(
  sheets: readonly SheetJson[],
  ref: string,
): { ok: true; sheet: SheetJson } | SheetRefusal {
  const wanted = ref.trim();
  if (!sheets.length)
    return {
      ok: false,
      code: 'sheet_not_found',
      message: 'This document has no sheets. Put one on a tab with add_sheet.',
    };
  const byId = sheets.find((s) => s.id === wanted);
  if (byId) return { ok: true, sheet: byId };
  const lower = wanted.toLowerCase();
  const titled = sheets.filter((s) => s.title.toLowerCase() === lower);
  if (titled.length === 1) return { ok: true, sheet: titled[0]! };
  if (titled.length > 1)
    return {
      ok: false,
      code: 'sheet_ambiguous',
      message: `More than one tab has a sheet called "${wanted}": name it by id. ${listed(titled)}.`,
    };
  const prefixed = wanted.length >= 4 ? sheets.filter((s) => s.id.startsWith(wanted)) : [];
  if (prefixed.length === 1) return { ok: true, sheet: prefixed[0]! };
  return {
    ok: false,
    code: 'sheet_not_found',
    message: `No sheet "${wanted}". Sheets: ${listed(sheets)}.`,
  };
}

// The workbook the sheet on `tabId` belongs to: a spreadsheet's every sheet, held to its limits
// (docs/specs/029-sheets/spreadsheet.md "The workbook shape", "Limits"), or a Plan tab's sheets (references reach only
// the tab's) held to a Plan Sheet's, with the spreadsheet's iterative calculation (settings.md "Calculation"); with
// the document's Plan cards when a formula reads them.
export async function workbookFor(
  api: ApiClient,
  documentId: string,
  state: SheetsState,
  tabId: string,
): Promise<Workbook> {
  const spreadsheet = state.workbook !== null;
  const sheets = spreadsheet ? state.sheets : state.sheets.filter((s) => s.tabId === tabId);
  const wb = new Workbook({
    sheets: sheets.map(sheetFromJson),
    locale: AGENT_LOCALE,
    limits: SheetLimits.of(spreadsheet),
    ...(state.workbook ? { iteration: state.workbook.settings.iterate } : {}),
  });
  if (wb.usesCards()) {
    const [{ items }, { document }] = await Promise.all([
      api.json<ItemsResponse>(itemsPath(documentId)),
      api.json<DocumentResponse>(`/documents/${encodeURIComponent(documentId)}`),
    ]);
    wb.setCards(cardSourceOf(items, typesOf(readItemTypeCatalogue(document.itemTypes ?? null))));
  }
  return wb;
}
