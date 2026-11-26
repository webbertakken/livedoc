// create_spreadsheet and `livedoc spreadsheet new` (docs/specs/029-sheets/sheet-store.md "Built for agents in a
// spreadsheet"): a spreadsheet document, its sheets named in order, each a sheet tab, made in one request in ODF (C5)
// with the agents' locale and UTC; then each sheet's first cells, read as typed in the agents' locale, every formula
// read before anything is made; the room checks the caps as they land. A sheet whose filling is refused after the spreadsheet is made
// leaves it made, and the answer says which sheets were filled.
import type { ApiClient } from '@livedoc/api-client';
import { CLIENT_HEADER, creationIntentOf, type DocumentResponse } from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import {
  AGENT_LOCALE,
  emptySheet,
  makeSheetId,
  parseCsv,
  SheetLimits,
  SheetName,
  splitWrite,
  Workbook,
  WorkbookRecord,
  workbookSheetLayout,
  WORKBOOK_FIRST_SHEET_NAME,
  writeRows,
  type AgentValue,
  type Rand,
  type Sheet,
  type SheetWrite,
} from '@livedoc/sheets';
import { apiRefusalOf } from '../plan/api-refusal';
import { sendSheetWrite } from './change-sheet';
import { rowsRefusal } from './sheet-refusals';
import type { SheetRefusal } from './sheet-state';

export type SpreadsheetSheetInput = { name: string; rows?: AgentValue[][]; csv?: string };

export type CreateSpreadsheetInput = {
  name: string;
  sheets?: SpreadsheetSheetInput[];
  // A folder of the person's, or null for the root; absent files it as create_document files a document.
  folderId?: string | null;
};

export type CreateSpreadsheetResult =
  | {
      ok: true;
      documentId: string;
      name: string;
      sheets: { name: string; sheetId: string; tabId: string; filled: string | null }[];
      // Set when a sheet's filling was refused after the spreadsheet was made.
      refusal?: { code: string; message: string };
    }
  | SheetRefusal;

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

// The most sheets one call makes (a spreadsheet's own cap).
export const CREATE_SPREADSHEET_SHEETS_MAX = SheetLimits.spreadsheet.sheets;

type Planned = { sheet: Sheet; writes: SheetWrite[]; filled: string | null };

// Each sheet blank, named and checked, and its first cells as writes against a workbook of every sheet (a formula may
// read a sheet named after it).
function plan(input: CreateSpreadsheetInput, rand: Rand): Planned[] | SheetRefusal {
  const given = input.sheets?.length ? input.sheets : [{ name: WORKBOOK_FIRST_SHEET_NAME }];
  if (given.length > CREATE_SPREADSHEET_SHEETS_MAX)
    return refuse(
      'sheets_full',
      `A spreadsheet holds up to ${CREATE_SPREADSHEET_SHEETS_MAX} sheets.`,
    );
  const names: string[] = [];
  for (const s of given) {
    const named = SheetName.check(s.name, names);
    if (!named.ok)
      return refuse(
        named.refusal,
        named.refusal === 'sheet_name_taken'
          ? `Two sheets are called "${s.name.trim()}": each sheet's name is its own.`
          : `"${s.name}" is no sheet name: up to 100 characters, none of [ ] * ? / \\ :, not starting or ending with '.`,
      );
    names.push(named.name);
  }
  const blanks = names.map((title) =>
    emptySheet({
      id: makeSheetId(rand),
      tabId: crypto.randomUUID(),
      title,
      layout: workbookSheetLayout(),
    }),
  );
  const wb = new Workbook({
    sheets: blanks,
    locale: AGENT_LOCALE,
    limits: SheetLimits.spreadsheet,
  });
  const planned: Planned[] = [];
  for (const [i, s] of given.entries()) {
    const blank = blanks[i]!;
    const parsed = s.csv !== undefined ? parseCsv(s.csv) : null;
    const rows = parsed?.rows ?? s.rows;
    if (!rows?.length || rows.every((r) => r.length === 0)) {
      planned.push({ sheet: blank, writes: [], filled: null });
      continue;
    }
    const made = writeRows(wb, blank.id, 'A1', rows, rand);
    if (!made.ok) return rowsRefusal(made, blank.title);
    planned.push({ sheet: blank, writes: [made.write], filled: made.range });
  }
  return planned;
}

export async function createSpreadsheet(
  api: ApiClient,
  input: CreateSpreadsheetInput,
  client: 'mcp' | 'cli',
  rand: Rand = Math.random,
): Promise<CreateSpreadsheetResult> {
  const name = input.name.trim();
  if (!name) return refuse('write_invalid', 'A spreadsheet needs a name.');
  const planned = plan(input, rand);
  if (!Array.isArray(planned)) return planned;
  const tabs: Tab[] = planned.map(({ sheet }) => ({
    id: sheet.tabId,
    name: sheet.title,
    kind: 'sheet',
    elements: [],
  }));
  const documentId = crypto.randomUUID();
  try {
    await api.json<DocumentResponse>('/documents', {
      method: 'POST',
      headers: { [CLIENT_HEADER]: client },
      body: JSON.stringify({
        id: documentId,
        name,
        source: client,
        tabs,
        intent: creationIntentOf(tabs[0]),
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        sheets: planned.map(({ sheet }) => ({
          id: sheet.id,
          tabId: sheet.tabId,
          title: sheet.title,
          layout: sheet.layout,
        })),
        workbook: WorkbookRecord.create({ locale: AGENT_LOCALE, timeZone: 'UTC' }),
      }),
    });
  } catch (err) {
    const refusal = apiRefusalOf(err);
    if (!refusal) throw err;
    return { ok: false, ...refusal };
  }
  console.info('[sheets] spreadsheet made by an agent', { sheets: planned.length, client });
  const sheets: Extract<CreateSpreadsheetResult, { ok: true }>['sheets'] = [];
  for (const p of planned) {
    let sheet = p.sheet;
    try {
      for (const part of p.writes.flatMap((w) => splitWrite(w)))
        sheet = await sendSheetWrite(api, documentId, sheet, part, client);
    } catch (err) {
      const refusal = apiRefusalOf(err);
      if (!refusal) throw err;
      return {
        ok: true,
        documentId,
        name,
        sheets,
        refusal: {
          code: refusal.code,
          message: `The spreadsheet was made, but filling "${p.sheet.title}" was refused: ${refusal.message}`,
        },
      };
    }
    sheets.push({
      name: p.sheet.title,
      sheetId: p.sheet.id,
      tabId: p.sheet.tabId,
      filled: p.filled,
    });
  }
  return { ok: true, documentId, name, sheets };
}
