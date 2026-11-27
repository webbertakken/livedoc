// A spreadsheet's sheets changed with their tabs (docs/specs/029-sheets/sheet-store.md "Changing the workbook"):
//   POST   /api/documents/<id>/workbook/sheets                    add a sheet tab: its tab and sheet in one batch, or
//                                                                 a copy of a sheet (`copyOf`, Duplicate), or one
//                                                                 carried in whole (`seed`, Copy To)
//   POST   /api/documents/<id>/workbook/sheets/<sheetId>/move     its tab after the tab named, first for ''
//   POST   /api/documents/<id>/workbook/sheets/<sheetId>/rename   the sheet's title and its tab's name as one write
//   DELETE /api/documents/<id>/workbook/sheets/<sheetId>          its tab removed, its sheet kept for Undo; never the
//                                                                 last visible sheet
// Editors only, never on a tab-scoped link. Answered inside the document's room.
import { protectedRefusal, protectionCallerOf, sheetDeleteRefusal } from './sheet-protection';
import type {
  SheetWriteResponse,
  WorkbookSheetAddRequest,
  WorkbookSheetAddResponse,
  WorkbookSheetMoveResponse,
  WorkbookSheetRenameResponse,
} from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import {
  SheetLimits,
  SheetName,
  workbookSheetLayout,
  withFreeTableNames,
  isSheetId,
  makeSheetId,
  type SheetJson,
} from '@livedoc/sheets';
import {
  copySheetStatements,
  documentSheetTotals,
  getDocument,
  getTab,
  insertSheetStatements,
  listSheets,
  readSheetHead,
  tabOrderOpenStatement,
  tabWriteStatements,
  type SheetHead,
} from '../db';
import { sheetKeepStatement, sheetSettleStatements } from '../db/sheet-refs';
import { documentTabOrder, isSpreadsheet, tabOrderStatements, tabPlaceAfter } from '../db/workbook';
import { forbidden, json, methodNotAllowed, noContent } from '../responses';
import { relayDocumentMeta } from '../room-client';
import { readBody, type DocumentRouteContext } from './context';
import { writer } from './item-route-kit';
import {
  copiedTables,
  newGridProblem,
  relaySheet,
  sheetCaller,
  type SheetCaller,
  workbookRefused,
} from './sheet-route-kit';
import { storeSheetWrite } from './sheet-write-route';
import { removeDocumentTab } from './tab-removal';
import { liveSheets, shownElsewhere } from './workbook-shown-sheets';
import { readSeed, seedProblem } from './workbook-sheet-seed';

// A tab id a caller may name: what the editor makes (a UUID) and any id of the same alphabet up to this length.
const TAB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// An Editor on the whole of a spreadsheet: a tab-scoped link never reaches a sheet tab's structure.
async function workbookEditor(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<SheetCaller | Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  if (!(await isSpreadsheet(ctx.env, documentId)))
    return workbookRefused('workbook_not_found', 404);
  return caller;
}

// The sheets on the document's tabs, in tab order: a deleted tab's sheet only waits to expire.
function readAdd(raw: Record<string, unknown> | Response): WorkbookSheetAddRequest | null {
  if (raw instanceof Response) return null;
  const { name, after, tabId, sheetId, copyOf, seed } = raw;
  if (name !== undefined && typeof name !== 'string') return null;
  if (after !== undefined && typeof after !== 'string') return null;
  if (tabId !== undefined && (typeof tabId !== 'string' || !TAB_ID_PATTERN.test(tabId)))
    return null;
  if (sheetId !== undefined && !isSheetId(sheetId)) return null;
  if (copyOf !== undefined && !isSheetId(copyOf)) return null;
  const seeded = seed === undefined ? undefined : readSeed(seed);
  if (seeded === null || (seeded && copyOf !== undefined)) return null;
  return {
    ...(seeded ? { seed: seeded } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(tabId !== undefined ? { tabId } : {}),
    ...(sheetId !== undefined ? { sheetId } : {}),
    ...(copyOf !== undefined ? { copyOf } : {}),
  };
}

// The tab list as it now stands, to everyone on the document.
async function relayTabs(ctx: DocumentRouteContext, documentId: string): Promise<void> {
  const document = await getDocument(ctx.env, documentId);
  if (document) await relayDocumentMeta(ctx.env, documentId, document.name, document.tabs);
}

async function addSheet(ctx: DocumentRouteContext, documentId: string): Promise<Response> {
  const started = Date.now();
  const caller = await workbookEditor(ctx, documentId);
  if (caller instanceof Response) return caller;
  const add = readAdd(await readBody(ctx));
  if (!add) return workbookRefused('write_invalid', 400);
  const live = await liveSheets(ctx, documentId);
  const source = add.copyOf ? live.find((h) => h.id === add.copyOf) : undefined;
  if (add.copyOf && !source) return workbookRefused('sheet_not_found', 404);
  const orderIndex = await tabPlaceAfter(ctx.env, documentId, add.after ?? source?.tabId);
  if (orderIndex === null) return workbookRefused('tab_not_found', 404);
  const kept = add.sheetId ? await readSheetHead(ctx.env, documentId, add.sheetId) : null;
  // A sheet still kept from its deleted tab, named with that tab: put back as it was (an undo of its delete).
  if (kept) return restoreSheet(ctx, caller, kept, add, live, orderIndex, started);
  const tabId = add.tabId ?? crypto.randomUUID();
  if (await getTab(ctx.env, documentId, tabId)) return workbookRefused('sheet_exists', 409);
  const titles = live.map((h) => h.title);
  let name = source ? SheetName.fit(`Copy of ${source.title}`, titles) : SheetName.next(titles);
  // A sheet carried in keeps its name as the rules let it here, as a duplicate does.
  if (add.seed && add.name !== undefined) name = SheetName.fit(add.name, titles);
  else if (add.name !== undefined) {
    const named = SheetName.check(add.name, titles);
    if (!named.ok)
      return workbookRefused(named.refusal, named.refusal === 'sheet_name_taken' ? 409 : 400);
    name = named.name;
  }
  const totals = await documentSheetTotals(ctx.env, documentId);
  if (totals.sheets >= SheetLimits.spreadsheet.sheets) return workbookRefused('sheets_full', 413);
  const now = Date.now();
  const by = await writer(ctx, caller.owner);
  if (source) {
    if (totals.cells + source.cellCount > SheetLimits.spreadsheet.documentCells)
      return workbookRefused('sheets_full', 413);
    const id = add.sheetId ?? makeSheetId();
    const grid = await newGridProblem(ctx, documentId, id, source.layout);
    if (grid) return grid;
    const tab: Tab = { id: tabId, name, kind: 'sheet', elements: [] };
    // The tab first: the copy is referenced as it lands, so it never waits to expire.
    await ctx.env.DOCUMENT_DB.batch([
      tabOrderOpenStatement(ctx.env, documentId, orderIndex),
      ...tabWriteStatements(ctx.env, documentId, tab, orderIndex, { advance: true }, now),
      ...copySheetStatements(
        ctx.env,
        documentId,
        source.id,
        { id, tabId, title: name, by },
        now,
        true,
        copiedTables(source.layout, live),
      ),
    ]);
    return added(ctx, documentId, tab, id, orderIndex, started, 'copied');
  }
  const sheet: SheetJson = {
    id: add.sheetId ?? makeSheetId(),
    tabId,
    title: name,
    // A sheet carried in takes table names free of the workbook's (data-tools.md D451).
    layout: add.seed?.layout
      ? withFreeTableNames(
          add.seed.layout,
          live.map((h) => h.layout),
        )
      : workbookSheetLayout(),
    cells: add.seed?.cells ?? [],
    rev: 0,
    createdAt: now,
    updatedAt: now,
    updatedBy: by,
  };
  const seeded = add.seed ? seedProblem(sheet, totals.cells) : null;
  if (seeded) return seeded;
  const grid = await newGridProblem(ctx, documentId, sheet.id, sheet.layout);
  if (grid) return grid;
  const tab: Tab = { id: tabId, name, kind: 'sheet', elements: [] };
  await ctx.env.DOCUMENT_DB.batch([
    tabOrderOpenStatement(ctx.env, documentId, orderIndex),
    ...tabWriteStatements(ctx.env, documentId, tab, orderIndex, { advance: true }, now),
    ...insertSheetStatements(ctx.env, documentId, sheet, now),
  ]);
  return added(ctx, documentId, tab, sheet.id, orderIndex, started, add.seed ? 'carried' : 'made');
}

// The tab of a kept sheet made again, with the sheet's id and title, and the sheet referenced again.
async function restoreSheet(
  ctx: DocumentRouteContext,
  caller: SheetCaller,
  kept: SheetHead,
  add: WorkbookSheetAddRequest,
  live: readonly SheetHead[],
  orderIndex: number,
  started: number,
): Promise<Response> {
  const { documentId } = caller;
  if (live.some((h) => h.id === kept.id) || (add.tabId !== undefined && add.tabId !== kept.tabId))
    return workbookRefused('sheet_exists', 409);
  const named = SheetName.check(
    kept.title,
    live.map((h) => h.title),
  );
  if (!named.ok) return workbookRefused(named.refusal, 409);
  const grid = await newGridProblem(ctx, documentId, kept.id, kept.layout);
  if (grid) return grid;
  const now = Date.now();
  const tab: Tab = { id: kept.tabId, name: named.name, kind: 'sheet', elements: [] };
  await ctx.env.DOCUMENT_DB.batch([
    tabOrderOpenStatement(ctx.env, documentId, orderIndex),
    ...tabWriteStatements(ctx.env, documentId, tab, orderIndex, { advance: true }, now),
    sheetKeepStatement(ctx.env, documentId, kept.id),
    ...sheetSettleStatements(ctx.env, documentId, now),
  ]);
  return added(ctx, documentId, tab, kept.id, orderIndex, started, 'restored');
}

async function added(
  ctx: DocumentRouteContext,
  documentId: string,
  tab: Tab,
  sheetId: string,
  orderIndex: number,
  started: number,
  how: 'made' | 'copied' | 'carried' | 'restored',
): Promise<Response> {
  const [stored] = await listSheets(ctx.env, documentId, { ids: [sheetId] });
  // The tab first, so a client that learns of the sheet already holds its tab.
  await relayTabs(ctx, documentId);
  relaySheet(ctx, documentId, {
    kind: 'sheets',
    sheetId,
    tabId: tab.id,
    rev: stored!.rev,
    created: true,
  });
  console.info(
    `[workbook] sheet added document=${documentId} at=${orderIndex} how=${how} ms=${Date.now() - started}`,
  );
  const body: WorkbookSheetAddResponse = {
    tab: { id: tab.id, name: tab.name, orderIndex },
    sheet: stored!,
  };
  return json(body, { status: 201 });
}

async function renameSheet(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await workbookEditor(ctx, documentId);
  if (caller instanceof Response) return caller;
  const raw = await readBody(ctx);
  if (raw instanceof Response) return workbookRefused('write_invalid', 400);
  if (typeof raw.name !== 'string') return workbookRefused('sheet_name_invalid', 400);
  const head = (await liveSheets(ctx, documentId)).find((h) => h.id === sheetId);
  if (!head) return workbookRefused('sheet_not_found', 404);
  // A spreadsheet's title write names its tab too, in the same batch (sheet-write-route.ts).
  const res = await storeSheetWrite(
    ctx,
    documentId,
    sheetId,
    { write: { kind: 'title', title: raw.name } },
    await writer(ctx, caller.owner),
    null,
    await protectionCallerOf(ctx, caller, caller.owner),
  );
  if (!res.ok) return res;
  const landed = await res.json<SheetWriteResponse>();
  const name = landed.applied.kind === 'title' ? landed.applied.title : head.title;
  console.info(`[workbook] sheet renamed document=${documentId} rev=${landed.rev}`);
  const body: WorkbookSheetRenameResponse = { tabId: head.tabId, sheetId, name, rev: landed.rev };
  return json(body);
}

// A sheet's tab moved among the document's tabs: the order the engines count sheets in (SHEET).
async function moveSheet(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await workbookEditor(ctx, documentId);
  if (caller instanceof Response) return caller;
  const raw = await readBody(ctx);
  if (raw instanceof Response || typeof raw.after !== 'string')
    return workbookRefused('write_invalid', 400);
  const after = raw.after;
  const head = (await liveSheets(ctx, documentId)).find((h) => h.id === sheetId);
  if (!head) return workbookRefused('sheet_not_found', 404);
  const order = (await documentTabOrder(ctx.env, documentId)).filter((id) => id !== head.tabId);
  const at = after === '' ? 0 : order.indexOf(after) + 1;
  if (at === 0 && after !== '') return workbookRefused('tab_not_found', 404);
  order.splice(at, 0, head.tabId);
  await ctx.env.DOCUMENT_DB.batch(tabOrderStatements(ctx.env, documentId, order));
  await relayTabs(ctx, documentId);
  console.info(`[workbook] sheet moved document=${documentId} at=${at}`);
  const body: WorkbookSheetMoveResponse = { tabId: head.tabId, sheetId, orderIndex: at };
  return json(body);
}

async function deleteSheet(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await workbookEditor(ctx, documentId);
  if (caller instanceof Response) return caller;
  const live = await liveSheets(ctx, documentId);
  const head = live.find((h) => h.id === sheetId);
  if (!head) return workbookRefused('sheet_not_found', 404);
  if (!shownElsewhere(live, sheetId)) return workbookRefused('sheet_last_visible', 409);
  // A protected sheet goes only by one its protection admits (D347).
  const guarded = sheetDeleteRefusal(
    head.layout,
    await protectionCallerOf(ctx, caller, caller.owner),
  );
  if (guarded) return protectedRefusal(guarded, documentId);
  await removeDocumentTab(ctx, documentId, head.tabId);
  await relayTabs(ctx, documentId);
  relaySheet(ctx, documentId, {
    kind: 'sheets',
    sheetId,
    tabId: head.tabId,
    rev: head.rev,
    deleted: true,
  });
  console.info(`[workbook] sheet deleted document=${documentId} sheets=${live.length - 1}`);
  return noContent();
}

/** The workbook's sheet routes, under /workbook/sheets, or null for a path that is not theirs. */
export async function handleWorkbookSheetRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request } = ctx;
  if (segments[4] !== 'sheets') return null;
  const documentId = segments[2]!;
  const method = request.method;
  if (segments.length === 5)
    return method === 'POST' ? addSheet(ctx, documentId) : methodNotAllowed();
  const sheetId = segments[5]!;
  if (segments.length === 6)
    return method === 'DELETE' ? deleteSheet(ctx, documentId, sheetId) : methodNotAllowed();
  if (segments.length === 7 && segments[6] === 'rename')
    return method === 'POST' ? renameSheet(ctx, documentId, sheetId) : methodNotAllowed();
  if (segments.length === 7 && segments[6] === 'move')
    return method === 'POST' ? moveSheet(ctx, documentId, sheetId) : methodNotAllowed();
  return null;
}
