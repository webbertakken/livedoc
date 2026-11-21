// IMPORTRANGE through the api (docs/specs/029-sheets/formulas.md "Other workbooks"): the destination's side of
//   GET  /api/documents/<id>/workbook/imports?kind=range&source=<id>&range=<range string>
//   POST /api/documents/<id>/workbook/imports { sources }   connecting the spreadsheets its IMPORTRANGEs read
// It never fetches from the web, so neither SHEET_IMPORTS nor the web's Allow Access gate it. Reading asks the source's
// own room (sheet-range-read.ts), as the same reader; a source not connected answers which words the reader would see.
import type { WorkbookRoomOp, WorkbookSettingsResponse } from '@livedoc/api-schema';
import {
  RANGE_WORDS,
  rangeSource,
  readImportParams,
  WORKBOOK_RANGE_SOURCES_MAX,
  type ImportAnswer,
} from '@livedoc/sheets';
import { documentRoom } from '../document-room/document-client';
import { identityOf, type RouteIdentity } from '../document-room/document-route';
import { connectWorkbookRangeSources, readWorkbook } from '../db/workbook';
import { forbidden, json, rateLimited } from '../responses';
import { relayWorkbook } from '../room-client';
import type { DocumentEnv } from '../types';
import type { DocumentRouteContext } from './context';
import { answerRangeRead, PERMISSION, type RangeReadQuery } from './sheet-range-read';
import { sheetCaller, workbookRefused } from './sheet-route-kit';

const CONNECT: ImportAnswer = { error: '#REF!', why: RANGE_WORDS.connect, connect: true };

/** A source's range, read in its own room as `identity`; a room that cannot be reached says so. */
export async function readInRoom(
  env: DocumentEnv,
  source: string,
  query: RangeReadQuery,
  identity: RouteIdentity,
): Promise<ImportAnswer> {
  try {
    return await documentRoom(env, source).readRange(query, identity);
  } catch (error) {
    console.warn('[imports] range failed', {
      source,
      reason: String(error),
    });
    return { error: '#N/A', why: RANGE_WORDS.unreadable };
  }
}

// Whether the caller may open `source`: the same gate a read of it passes, asked from here.
async function mayRead(ctx: DocumentRouteContext, source: string): Promise<boolean> {
  return !((await sheetCaller(ctx, source, 'read')) instanceof Response);
}

export async function fetchRangeImport(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const request = readImportParams(ctx.url.searchParams);
  if (request?.kind !== 'range') return workbookRefused('import_invalid', 400);
  const { source, range } = request;
  const query: RangeReadQuery = { range, path: [documentId] };
  // A spreadsheet reading itself needs no connecting (D76), and is read here, in its own room.
  if (source === documentId)
    return json(await answerRangeRead(ctx, documentId, query, nestedFrom(ctx)));
  if (!record.rangeSources?.includes(source)) {
    // Google's order: a source the reader may not open says so before asking to connect it.
    const readable = await mayRead(ctx, source);
    console.info('[imports] range refused', {
      documentId,
      source,
      reason: readable ? 'not_connected' : 'permission',
    });
    return json(readable ? CONNECT : PERMISSION);
  }
  const limiter = ctx.env.SHEET_IMPORT_RATE_LIMITER;
  if (limiter && !(await limiter.limit({ key: `sheet-range:${documentId}` })).success) {
    console.info('[imports] range refused', { documentId, source, reason: 'rate_limited' });
    return rateLimited();
  }
  return json(await readInRoom(ctx.env, source, query, identityOf(ctx)));
}

/** How a range read here asks a further source, as the same reader. */
export function nestedFrom(ctx: DocumentRouteContext) {
  const identity = identityOf(ctx);
  return (source: string, query: RangeReadQuery) => readInRoom(ctx.env, source, query, identity);
}

/** The sources a connect body names, each a document id, none twice; null when it names none or is not one. */
export function readConnectSources(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const { sources } = body as Record<string, unknown>;
  if (!Array.isArray(sources) || sources.length === 0) return null;
  if (sources.length > WORKBOOK_RANGE_SOURCES_MAX) return null;
  // Ids as the page sends them, never addresses: the page has read each formula's address already.
  if (!sources.every((s): s is string => typeof s === 'string' && rangeSource(s) === s))
    return null;
  return [...new Set(sources)];
}

export async function connectRangeSources(
  ctx: DocumentRouteContext,
  documentId: string,
  body: unknown,
): Promise<Response> {
  const asked = readConnectSources(body);
  if (!asked) return workbookRefused('range_sources_invalid', 400);
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const had = new Set(record.rangeSources ?? []);
  const fresh = asked.filter((id) => id !== documentId && !had.has(id));
  // Only the sources this Editor may open are connected; the rest keep asking (formulas.md "Connecting").
  const readable = (await Promise.all(fresh.map((id) => mayRead(ctx, id)))).map((ok, i) =>
    ok ? fresh[i]! : null,
  );
  const sources = readable.filter((id): id is string => id !== null);
  if (fresh.length > 0 && sources.length === 0) {
    console.info(`[workbook] range sources refused document=${documentId} asked=${asked.length}`);
    return forbidden();
  }
  if (had.size + sources.length > WORKBOOK_RANGE_SOURCES_MAX)
    return workbookRefused('range_sources_full', 409);
  // The row was read above; a spreadsheet is never turned back into another kind.
  const connected = (await connectWorkbookRangeSources(ctx.env, documentId, sources, Date.now()))!;
  const op: WorkbookRoomOp = { kind: 'workbook', ...connected };
  ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
  console.info(
    `[workbook] range sources connected document=${documentId} added=${sources.length} refused=${fresh.length - sources.length}`,
  );
  return json(connected satisfies WorkbookSettingsResponse);
}
