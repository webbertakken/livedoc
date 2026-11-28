// A spreadsheet's comment threads (docs/specs/029-sheets/review.md "Comments"): the workbook's threads read by whoever
// may comment (a Viewer reads none, D655), and one op a write on a sheet's thread, judged for who may make it, its
// author stamped from who sends it, stored guarded by the thread's `v` and relayed as the thread's whole state.
import {
  applyThreadOp,
  readThreadOp,
  SHEET_THREADS_MAX,
  threadIdOf,
  type SheetThreadRefusal,
} from '@livedoc/document';
import type {
  SheetThreadResponse,
  SheetThreadRoomOp,
  SheetThreadsFromFileResponse,
  SheetThreadsResponse,
} from '@livedoc/api-schema';
import { threadsFromFile } from '../document-room/sheet-thread-files';
import { adderKeyFor } from '../adder-key';
import { readSheetHead } from '../db';
import { readThreadAt, readWorkbookThreads, storeThread } from '../db/sheet-threads';
import { isSpreadsheet } from '../db/workbook';
import { forbidden, json } from '../responses';
import { relaySheets } from '../room-client';
import { gateParticipate, readBody, type DocumentRouteContext } from './context';
import { writer } from './item-route-kit';
import {
  SHEET_WRITE_RETRIES,
  sheetBusy,
  sheetCaller,
  sheetCallerEdits,
  sheetNotFound,
  sheetRejected,
} from './sheet-route-kit';

const REFUSAL_STATUS: Record<SheetThreadRefusal, number> = {
  thread_invalid: 400,
  thread_gone: 404,
  threads_full: 413,
  thread_full: 413,
  forbidden: 403,
};

// GET /api/documents/:id/sheet-threads: every thread of the workbook (a tab-scoped caller's tab's), none for a Viewer.
export async function listSheetThreads(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  const comments = await gateParticipate(
    ctx,
    documentId,
    caller.ownerId,
    caller.teamId,
    caller.scopeTab ?? undefined,
  );
  const threads = comments ? await readWorkbookThreads(ctx.env, documentId, caller.scopeTab) : [];
  console.info('[sheets] threads read', { documentId, threads: threads.length, viewer: !comments });
  return json({ threads } satisfies SheetThreadsResponse);
}

// POST /api/documents/:id/sheets/:sheetId/threads: one op on a thread of the sheet.
export async function writeSheetThread(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'participate');
  if (caller instanceof Response) return caller;
  const raw = await readBody(ctx);
  const op = readThreadOp((raw as { op?: unknown } | null)?.op);
  if (!op) return sheetRejected('thread_invalid');
  const head = await readSheetHead(ctx.env, documentId, sheetId);
  if (!head || (caller.scopeTab && head.tabId !== caller.scopeTab)) return sheetNotFound();
  // Threads are a spreadsheet's; a Plan Sheet keeps its cell threads on its element (sheet.md "Cell comments").
  if (!(await isSpreadsheet(ctx.env, documentId))) return sheetNotFound();
  const [person, key] = await Promise.all([
    writer(ctx, caller.owner),
    adderKeyFor(documentId, caller.owner),
  ]);
  // Removing another's comment is an Editor's alone: the gate is asked only then.
  const edits = op.op === 'remove' ? await sheetCallerEdits(ctx, caller) : false;
  const id = threadIdOf(op);
  for (let attempt = 0; attempt < SHEET_WRITE_RETRIES; attempt++) {
    const { thread, count } = await readThreadAt(ctx.env, documentId, sheetId, id);
    const now = Date.now();
    const result = applyThreadOp(
      { sheetId, thread, count, axes: { rows: head.layout.rows, cols: head.layout.cols } },
      op,
      { key, name: person.name, colour: person.color, edits, now },
    );
    if (!result.ok) {
      console.info('[sheets] thread refused', { op: op.op, refusal: result.refusal });
      return result.refusal === 'forbidden'
        ? forbidden()
        : sheetRejected(result.refusal, REFUSAL_STATUS[result.refusal]);
    }
    if (!(await storeThread(ctx.env, documentId, sheetId, thread, id, result.thread, now)))
      continue;
    console.info(
      `[sheets] thread ${op.op} sheet=${sheetId} thread=${id} v=${result.thread?.v ?? 'gone'}`,
    );
    const relayed: SheetThreadRoomOp = {
      kind: 'sheet-thread',
      sheetId,
      tabId: head.tabId,
      id,
      thread: result.thread,
    };
    ctx.waitUntil?.(relaySheets(ctx.env, documentId, relayed));
    return json({ id, thread: result.thread } satisfies SheetThreadResponse);
  }
  return sheetBusy();
}

// POST /api/documents/:id/sheets/:sheetId/file-threads: an opened file's threads, stored with the new spreadsheet
// (standard-mapping.md "Comments in the file"), an Editor's: each comment "From the file", no key, bounded as any
// thread; past the sheet's room for threads, left out. Sent in parts by size, each part answered with what it stored.
export async function importSheetThreads(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const raw = await readBody(ctx);
  const threads = (raw as { threads?: unknown } | null)?.threads;
  if (!Array.isArray(threads)) return sheetRejected('thread_invalid');
  const head = await readSheetHead(ctx.env, documentId, sheetId);
  if (!head || !(await isSpreadsheet(ctx.env, documentId))) return sheetNotFound();
  const { count } = await readThreadAt(ctx.env, documentId, sheetId, '');
  const room = Math.max(0, SHEET_THREADS_MAX - count);
  const made = threadsFromFile(sheetId, head.layout, threads, () => crypto.randomUUID()).slice(
    0,
    room,
  );
  const now = Date.now();
  let stored = 0;
  for (const thread of made)
    if (await storeThread(ctx.env, documentId, sheetId, null, thread.id, thread, now)) stored++;
  console.info(
    `[sheets] threads from file sheet=${sheetId} sent=${threads.length} stored=${stored} room=${room}`,
  );
  return json({ stored } satisfies SheetThreadsFromFileResponse);
}
