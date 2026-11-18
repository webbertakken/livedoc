// One write to a sheet (docs/specs/029-sheets/sheet-store.md "Changing a sheet",
// docs/specs/029-sheets/sheet-store.md "Data
// and persistence"): validated by the engine, applied by the engine to what the write needs (the layout, and the
// formulas a deletion shrinks), stored in one batch guarded by the sheet's rev (retried on a lost race), answered
// with the stored state of every cell it touched, and relayed in order.

import type { SheetWriteRequest, SheetWriteResponse } from '@livedoc/api-schema';
import {
  DOCUMENT_CELLS_MAX,
  SHEET_BYTES_MAX,
  SheetName,
  SHEET_CELLS_MAX,
  applySheetWrite,
  cellKey,
  cellsFromJson,
  shrinkReadersOf,
  validateWrite,
  valuesOnly,
  writesFormats,
  type Cell,
  type CellChange,
  type Sheet,
  type SheetPerson,
  type SheetWrite,
} from '@livedoc/sheets';
import {
  axisDeleteStatement,
  cellWriteStatements,
  documentSheetTotals,
  existingCells,
  headWriteStatement,
  listSheetHeads,
  readCells,
  readFormulaCells,
  readSheetHead,
  recountStatement,
  documentSavedStatement,
  type SheetHead,
} from '../db';
import { sheetTabRenameStatement } from '../db/tabs';
import { isSpreadsheet } from '../db/workbook';
import { forbidden, json } from '../responses';
import { relayTabRename } from '../room-client';
import { readBody, type DocumentRouteContext } from './context';
import { writer } from './item-route-kit';
import {
  SHEET_WRITE_RETRIES,
  relaySheet,
  sheetBusy,
  sheetCaller,
  sheetCallerEdits,
  sheetNotFound,
  sheetRejected,
} from './sheet-route-kit';

function readWrite(raw: unknown): SheetWriteRequest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.write !== 'object' || b.write === null) return null;
  if (b.wid !== undefined && (typeof b.wid !== 'string' || b.wid.length > 64)) return null;
  return {
    write: b.write as SheetWrite,
    ...(typeof b.wid === 'string' ? { wid: b.wid } : {}),
    ...(b.undo === true ? { undo: true } : {}),
    ...(b.unchecked === true ? { unchecked: true } : {}),
  };
}

// Rows or columns deleted from `head` shrink the ranges into it held by the tab's other sheets, as its own formulas'
// ranges shrink (docs/specs/029-sheets/formulas.md "Other sheets"): each reading sheet's formula cells read once, its
// rewrites stored and relayed as a write of its own. Linear in the tab's formula references; the tab's sheets are read
// side by side.
async function shrinkReaders(
  ctx: DocumentRouteContext,
  documentId: string,
  head: SheetHead,
  changes: Extract<SheetWrite, { kind: 'layout' }>['changes'],
  by: SheetPerson,
  // The tab whose sheets read one another, or undefined for a spreadsheet's whole workbook.
  scope: string | undefined,
): Promise<void> {
  const heads = await listSheetHeads(ctx.env, documentId, scope);
  await Promise.all(
    heads
      .filter((h) => h.id !== head.id)
      .map(async (h) => {
        const cells = cellsFromJson(await readFormulaCells(ctx.env, documentId, h.id));
        const rewrites = shrinkReadersOf(head.id, head.layout, changes, cells);
        if (rewrites.length === 0) return;
        const res = await storeSheetWrite(
          ctx,
          documentId,
          h.id,
          { write: { kind: 'cells', cells: rewrites }, unchecked: true },
          by,
          null,
        );
        if (res.ok) console.info('[sheets] sheets.readers.shrunk', { cells: rewrites.length });
        else console.warn('[sheets] sheets.readers.shrink_failed', { status: res.status });
      }),
  );
}

function deletes(write: SheetWrite): boolean {
  return (
    write.kind === 'layout' &&
    write.changes.some((c) => c.k === 'deleteRows' || c.k === 'deleteCols')
  );
}

// Upper bounds of what a write adds: cells it may create and the bytes it may store.
function growth(cells: readonly CellChange[]): { count: number; bytes: number; keys: string[] } {
  let count = 0;
  let bytes = 0;
  const keys: string[] = [];
  for (const ch of cells) {
    if ((ch.i !== undefined && ch.i !== null) || (ch.f !== undefined && ch.f !== null)) {
      count++;
      keys.push(cellKey(ch.r, ch.c));
    }
    if (ch.i) bytes += JSON.stringify(ch.i).length;
    if (ch.f) bytes += JSON.stringify(ch.f).length;
  }
  return { count, bytes, keys };
}

async function capsProblem(
  ctx: DocumentRouteContext,
  documentId: string,
  head: SheetHead,
  cells: readonly CellChange[],
): Promise<Response | null> {
  const g = growth(cells);
  if (g.count === 0) return null;
  let added = g.count;
  let addedBytes = g.bytes;
  const near =
    head.cellCount + g.count > SHEET_CELLS_MAX || head.cellBytes + g.bytes > SHEET_BYTES_MAX;
  const totals = await documentSheetTotals(ctx.env, documentId);
  const docNear = totals.cells + g.count > DOCUMENT_CELLS_MAX;
  if (near || docNear) {
    // Close to a cap: count exactly, as cells the write replaces add nothing new.
    const existing = await existingCells(ctx.env, documentId, head.id, g.keys);
    added -= existing.count;
    addedBytes -= existing.bytes;
  }
  if (head.cellCount + added > SHEET_CELLS_MAX || head.cellBytes + addedBytes > SHEET_BYTES_MAX) {
    console.info('[sheets] sheets.full', { documentId });
    return sheetRejected('sheet_full', 413);
  }
  if (totals.cells + added > DOCUMENT_CELLS_MAX) return sheetRejected('sheets_full', 413);
  return null;
}

export async function writeSheet(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  // A Participant writes cells; rows, columns and the title are the Sheet's shape, an Editor's
  // (docs/specs/013-workspace/share-roles.md "What a Participant changes").
  const caller = await sheetCaller(ctx, documentId, 'participate');
  if (caller instanceof Response) return caller;
  const read = readWrite(await readBody(ctx));
  if (!read) return sheetRejected('write_invalid');
  if (read.write.kind !== 'cells' && !(await sheetCallerEdits(ctx, caller))) return forbidden();
  // And a cell's value, never its format (docs/specs/029-sheets/sheet.md "Who may do what"): a Participant's
  // write lands as its values, and one of formats alone is refused. Only a write carrying formats asks the gate.
  let body = read;
  if (writesFormats(read.write) && !(await sheetCallerEdits(ctx, caller))) {
    const values = valuesOnly(read.write);
    if (!values) return forbidden();
    body = { ...read, write: values };
  }
  const by = await writer(ctx, caller.owner);
  return storeSheetWrite(ctx, documentId, sheetId, body, by, caller.scopeTab ?? null);
}

// A checked write stored (docs/specs/029-sheets/sheet-store.md "Changing a sheet"): validated and applied by the engine,
// capped, stored in one batch guarded by the sheet's rev (retried on a lost race), answered with the cells it touched
// and relayed. The sheet route's, after its gates, and a form's response row's (forms/sheet-response.ts).
export async function storeSheetWrite(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
  body: SheetWriteRequest,
  by: SheetPerson,
  scopeTab: string | null,
): Promise<Response> {
  for (let attempt = 0; attempt < SHEET_WRITE_RETRIES; attempt++) {
    const head = await readSheetHead(ctx.env, documentId, sheetId);
    if (!head || (scopeTab && head.tabId !== scopeTab)) return sheetNotFound();
    const write = body.write;
    // A spreadsheet's sheets are one workbook: their titles are its tabs' names, unique in it, and their formulas read
    // across it (docs/specs/029-sheets/spreadsheet.md "The workbook shape"); a Plan Sheet's are its tab's.
    const spreadsheet = await isSpreadsheet(ctx.env, documentId);
    const scope = spreadsheet ? undefined : head.tabId;
    if (write.kind === 'title') {
      const others = (await listSheetHeads(ctx.env, documentId, scope))
        .filter((h) => h.id !== sheetId)
        .map((h) => h.title);
      const title = typeof write.title === 'string' ? write.title : '';
      if (spreadsheet) {
        const named = SheetName.check(title, others);
        if (!named.ok)
          return sheetRejected(named.refusal, named.refusal === 'sheet_name_taken' ? 409 : 400);
      } else if (others.some((t) => t.toLowerCase() === title.trim().toLowerCase()))
        return sheetRejected('sheet_title_taken', 409);
    }
    // The light sheet the engine applies to: the layout, and the formulas when rows or columns go.
    const light: Sheet = {
      ...head,
      cells: deletes(write)
        ? cellsFromJson(await readFormulaCells(ctx.env, documentId, sheetId))
        : new Map<string, Cell>(),
    };
    let landed;
    try {
      // Validation rules are checked unless the write is an undo or one stored as it is (data-validation.md).
      const check = validateWrite(light, write, { checkRules: !body.undo && !body.unchecked });
      if (!check.ok)
        return sheetRejected(
          check.error,
          check.error === 'sheet_too_large' ? 413 : 400,
          check.at,
          check.line,
        );
      landed = applySheetWrite(
        light,
        write.kind === 'title' ? { ...write, title: write.title.trim() } : write,
        {
          now: Date.now(),
          by,
        },
      );
    } catch {
      return sheetRejected('write_invalid');
    }
    const applied = landed.applied;
    const cells = applied.kind === 'title' ? [] : (applied.cells ?? []);
    const caps = await capsProblem(ctx, documentId, head, cells);
    if (caps) return caps;
    const now = Date.now();
    const nextRev = head.rev + 1;
    const nonce = crypto.randomUUID();
    const statements = [
      headWriteStatement(ctx.env, documentId, sheetId, head.rev, nonce, now, by, {
        ...(applied.kind === 'layout' && landed.sheet.layout !== head.layout
          ? { layout: landed.sheet.layout }
          : {}),
        ...(applied.kind === 'title' ? { title: landed.sheet.title } : {}),
      }),
    ];
    if (applied.kind === 'layout')
      for (const ch of applied.changes)
        if (ch.k === 'deleteRows' || ch.k === 'deleteCols')
          statements.push(
            axisDeleteStatement(
              ctx.env,
              documentId,
              sheetId,
              nonce,
              ch.k === 'deleteRows' ? 'r' : 'c',
              ch.ids,
            ),
          );
    statements.push(...cellWriteStatements(ctx.env, documentId, sheetId, nonce, cells));
    statements.push(recountStatement(ctx.env, documentId, sheetId));
    statements.push(documentSavedStatement(ctx.env, documentId, sheetId, nonce, now));
    // A spreadsheet's sheet tab is named as its sheet, in the same batch, only when the sheet's write landed (its nonce).
    if (spreadsheet && applied.kind === 'title')
      statements.push(
        sheetTabRenameStatement(
          ctx.env,
          { tabId: head.tabId, name: landed.sheet.title, at: now },
          { documentId, sheetId, nonce },
        ),
      );
    const results = await ctx.env.DOCUMENT_DB.batch(statements);
    const raised = (results[0]?.results ?? []) as { rev: number }[];
    if (raised.length === 0) {
      console.info('[sheets] sheets.write.retry', { attempt });
      continue;
    }
    const keys = cells.map((ch) => cellKey(ch.r, ch.c));
    const answer: SheetWriteResponse = {
      applied,
      rev: nextRev,
      cells: await readCells(ctx.env, documentId, sheetId, keys),
    };
    relaySheet(ctx, documentId, {
      kind: 'sheets',
      sheetId,
      tabId: head.tabId,
      rev: nextRev,
      applied,
      at: now,
      by,
      ...(body.wid ? { wid: body.wid } : {}),
    });
    if (spreadsheet && applied.kind === 'title')
      await relayTabRename(ctx.env, documentId, head.tabId, landed.sheet.title);
    if (applied.kind === 'layout' && deletes(write))
      await shrinkReaders(ctx, documentId, head, applied.changes, by, scope);
    return json(answer);
  }
  return sheetBusy();
}
