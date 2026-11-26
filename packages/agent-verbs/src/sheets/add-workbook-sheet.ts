// add_sheet in a spreadsheet (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"): a sheet tab
// added through the workbook's own door, named as given (else the next free SheetN), after the sheet `after` names
// (last when absent), then filled with its first cells or a design, whose charts are the sheet's own. The first cells
// are checked against the workbook's caps before the tab is made; a tab whose filling then fails is deleted, so a
// failed call leaves no half-made sheet.
import type { ApiClient } from '@livedoc/api-client';
import {
  CLIENT_HEADER,
  type WorkbookSheetAddRequest,
  type WorkbookSheetAddResponse,
} from '@livedoc/api-schema';
import {
  documentCellCount,
  emptySheet,
  sheetFromJson,
  SheetLimits,
  SheetName,
  splitWrite,
  workbookSheetLayout,
  type Rand,
  type Sheet,
  type SheetJson,
} from '@livedoc/sheets';
import { capsRefusal, sendSheetWrite, workbookSheetsPath } from './change-sheet';
import { firstCells, type AddSheetInput, type AddSheetResult } from './add-sheet';
import { chartObjectWrite } from './sheet-chart-objects';
import type { SheetRefusal } from './sheet-state';

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

export async function addWorkbookSheet(
  api: ApiClient,
  documentId: string,
  sheets: readonly SheetJson[],
  input: AddSheetInput & { after?: string },
  client: 'mcp' | 'cli',
  rand: Rand,
): Promise<AddSheetResult> {
  if (input.tabId !== undefined)
    return refuse(
      'write_invalid',
      'A spreadsheet’s sheets are its tabs: name the sheet to add it after with "after", not a tabId.',
    );
  const titles = sheets.map((s) => s.title);
  const named = input.title?.trim() ? SheetName.check(input.title, titles) : null;
  if (named && !named.ok)
    return refuse(
      named.refusal,
      named.refusal === 'sheet_name_taken'
        ? `Another sheet of this spreadsheet is called "${input.title!.trim()}".`
        : `"${input.title}" is no sheet name: up to 100 characters, none of [ ] * ? / \\ :, not starting or ending with '.`,
    );
  const after =
    input.after === undefined
      ? undefined
      : sheets.find((s) => s.title.toLowerCase() === input.after!.trim().toLowerCase());
  if (input.after !== undefined && !after)
    return refuse(
      'sheet_not_found',
      `No sheet "${input.after}" to add it after. Sheets: ${titles.map((t) => `"${t}"`).join(', ')}.`,
    );
  const name = named?.ok ? named.name : SheetName.next(titles);
  // The first cells, checked against the workbook's caps on a blank of the new sheet's shape before anything is made.
  const probe = emptySheet({
    id: 'probe00000',
    tabId: 'probe',
    title: name,
    layout: workbookSheetLayout(),
  });
  const others = sheets.map(sheetFromJson);
  const first = firstCells(input, others, probe, false, rand);
  if ('ok' in first) return first;
  if (first.writes.length) {
    const over = capsRefusal(
      probe,
      first.writes,
      documentCellCount(sheets),
      SheetLimits.spreadsheet,
    );
    if (over) return { ok: false, ...over };
  }
  const body: WorkbookSheetAddRequest = { name, ...(after ? { after: after.tabId } : {}) };
  const { sheet: made } = await api.json<WorkbookSheetAddResponse>(workbookSheetsPath(documentId), {
    method: 'POST',
    headers: { [CLIENT_HEADER]: client },
    body: JSON.stringify(body),
  });
  // Built again on the sheet as it was made: its row and column ids are the room's.
  const sheet = sheetFromJson(made);
  const built = firstCells(input, others, sheet, false, rand);
  if ('ok' in built) {
    await deleteMade(api, documentId, sheet.id);
    return built;
  }
  let filled: Sheet = sheet;
  try {
    for (const part of built.writes.flatMap((w) => splitWrite(w)))
      filled = await sendSheetWrite(api, documentId, filled, part, client);
    // A design's charts are the sheet's own (charts.md "The model").
    const taken = new Set<string>();
    for (const out of built.laidOut?.charts ?? []) {
      built.laidOut!.wb.updateSheet(filled);
      const chart = chartObjectWrite(built.laidOut!.wb, sheet.id, out, undefined, rand, taken);
      // A new chart's id is always free, so this is never refused; were it, the sheet goes as on any failure.
      if (!chart.ok) {
        await deleteMade(api, documentId, sheet.id);
        return chart;
      }
      taken.add(chart.id);
      filled = await sendSheetWrite(api, documentId, filled, chart.write, client);
    }
  } catch (err) {
    await deleteMade(api, documentId, sheet.id);
    throw err;
  }
  return {
    ok: true,
    tabId: made.tabId,
    sheetId: sheet.id,
    elementId: null,
    title: made.title,
    filled: built.filled,
    ...(built.laidOut ? { laidOut: built.laidOut.line } : {}),
    truncated: built.truncated,
    changesetId: null,
    rev: filled.rev,
  };
}

// A sheet tab made by a call that then failed: removed, so the call leaves the spreadsheet as it was.
async function deleteMade(api: ApiClient, documentId: string, sheetId: string): Promise<void> {
  try {
    const res = await api.fetch(
      `${workbookSheetsPath(documentId)}/${encodeURIComponent(sheetId)}`,
      {
        method: 'DELETE',
      },
    );
    console.info('[sheets] add_sheet failed; its sheet tab deleted', { status: res.status });
  } catch {
    console.warn('[sheets] add_sheet failed; its sheet tab not deleted');
  }
}
