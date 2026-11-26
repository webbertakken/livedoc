// A spreadsheet's views (docs/specs/024-agents/document-views.md "A spreadsheet's views"): its tabs are its sheets
// and hold no elements, so `outline` on any of them answers the workbook outline and `cells` reads the tab's sheet.
// Answered after the tab GET's gate and scope, as every view is; a link to one tab sees only its own sheet.
import { tabEtag } from '@livedoc/api-schema';
import {
  CELLS_NOT_SPREADSHEET,
  sheetCellsView,
  workbookOutlineView,
  type ViewRequest,
  type WorkbookOutlineSheet,
} from '@livedoc/document-views';
import { AGENT_LOCALE, SheetLimits, Workbook, type WorkbookRecord } from '@livedoc/sheets';
import { listSheetHeads } from '../db';
import { documentTabOrder, readWorkbook } from '../db/workbook';
import { json, textPlain } from '../responses';
import type { DocumentDTO, DocumentEnv, TabDTO } from '../types';
import { loadSpreadsheetSheets } from './workbook-sheets-load';

export type WorkbookViewAnswer = { response: Response; view: 'outline' | 'cells' } | null;

const refuseCells = (message: string): WorkbookViewAnswer => {
  console.info('[views] sheet refused', { message });
  return {
    response: json({ error: 'invalid_value', message }, { status: 400 }),
    view: 'cells',
  };
};

// The ids of the rows and columns holding a cell, per sheet: no cell itself is read.
async function usedAxes(
  env: DocumentEnv,
  documentId: string,
): Promise<Map<string, { rows: Set<string>; cols: Set<string> }>> {
  const [rows, cols] = await Promise.all(
    (['row_id', 'col_id'] as const).map((column) =>
      env.DOCUMENT_DB.prepare(
        `SELECT DISTINCT sheet_id, ${column} AS id FROM sheet_cells WHERE document_id = ?`,
      )
        .bind(documentId)
        .all<{ sheet_id: string; id: string }>(),
    ),
  );
  const out = new Map<string, { rows: Set<string>; cols: Set<string> }>();
  const of = (sheetId: string) => {
    let used = out.get(sheetId);
    if (!used) out.set(sheetId, (used = { rows: new Set(), cols: new Set() }));
    return used;
  };
  for (const r of rows!.results ?? []) of(r.sheet_id).rows.add(r.id);
  for (const c of cols!.results ?? []) of(c.sheet_id).cols.add(c.id);
  return out;
}

async function outline(
  env: DocumentEnv,
  document: DocumentDTO,
  tab: TabDTO,
  workbook: WorkbookRecord,
  inScope: (tabId: string) => boolean,
  request: ViewRequest,
): Promise<{ text: string; json: unknown; sheets: number }> {
  const [heads, order, used] = await Promise.all([
    listSheetHeads(env, document.id),
    documentTabOrder(env, document.id),
    usedAxes(env, document.id),
  ]);
  const at = new Map(order.map((id, i) => [id, i]));
  const none = { rows: new Set<string>(), cols: new Set<string>() };
  const sheets: WorkbookOutlineSheet[] = heads
    .filter((h) => at.has(h.tabId) && inScope(h.tabId))
    .sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!)
    .map((h) => {
      const axes = used.get(h.id) ?? none;
      return { ...h, usedRows: axes.rows, usedCols: axes.cols };
    });
  const view = workbookOutlineView(
    { name: document.name, workbook, sheets, current: tab.id },
    { budget: request.budget, door: request.door },
  );
  return { text: view.text, json: view.json, sheets: sheets.length };
}

// The view of a spreadsheet's tab, or null when the tab is none (the tab's own views answer).
export async function answerWorkbookView(
  env: DocumentEnv,
  request: ViewRequest,
  asJson: boolean,
  document: DocumentDTO,
  tab: TabDTO,
  tabScope: string | null,
): Promise<WorkbookViewAnswer> {
  const sheetTab = tab.kind === 'sheet';
  if (!sheetTab && request.view !== 'cells') return null;
  const workbook = sheetTab ? await readWorkbook(env, document.id) : null;
  if (!workbook) return request.view === 'cells' ? refuseCells(CELLS_NOT_SPREADSHEET) : null;
  if (request.view === 'outline' && (request.only !== undefined || request.style === true)) {
    console.info('[views] sheet refused', { view: 'outline', only: request.only !== undefined });
    return {
      response: json(
        {
          error: 'invalid_value',
          message: "a spreadsheet's outline has no elements to narrow or style",
        },
        { status: 400 },
      ),
      view: 'outline',
    };
  }
  if (request.view !== 'outline' && request.view !== 'cells') return null;
  const inScope = (tabId: string) => tabScope === null || tabId === tabScope;
  const started = Date.now();
  const headers = { ETag: tabEtag(tab.rev) };
  if (request.view === 'outline') {
    const view = await outline(env, document, tab, workbook, inScope, request);
    console.info('[views] rendered workbook outline', {
      doc: document.id,
      tab: tab.id,
      sheets: view.sheets,
      chars: view.text.length,
      ms: Date.now() - started,
    });
    return {
      response: asJson ? json(view.json, { headers }) : textPlain(view.text, { headers }),
      view: 'outline',
    };
  }
  const sheets = (await loadSpreadsheetSheets(env, document.id)).filter((s) => inScope(s.tabId));
  const sheet = sheets.find((s) => s.tabId === tab.id);
  if (!sheet) return refuseCells(CELLS_NOT_SPREADSHEET);
  const wb = new Workbook({
    sheets,
    locale: AGENT_LOCALE,
    limits: SheetLimits.of(true),
    iteration: workbook.settings.iterate,
    timeZone: workbook.settings.timeZone,
  });
  const view = sheetCellsView(
    {
      wb,
      sheetId: sheet.id,
      title: sheet.title,
      ...(request.range ? { range: request.range } : {}),
    },
    { budget: request.budget, door: request.door },
  );
  if (!view.ok) return refuseCells(view.message);
  console.info('[views] rendered cells', {
    doc: document.id,
    tab: tab.id,
    rows: view.json.rows.length,
    chars: view.text.length,
    ms: Date.now() - started,
  });
  return {
    response: asJson ? json(view.json, { headers }) : textPlain(view.text, { headers }),
    view: 'cells',
  };
}
