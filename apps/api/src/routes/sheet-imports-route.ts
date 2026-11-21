// A spreadsheet's imports from the web (docs/specs/029-sheets/imports.md): GET /api/documents/<id>/workbook/imports
// fetches one import for anyone who may read the spreadsheet, once an Editor allowed it, with the guards of
// public-fetch.ts, the hour's cache and a per-spreadsheet rate; POST .../workbook/imports is that allowing.
import type { WorkbookRoomOp, WorkbookSettingsResponse } from '@livedoc/api-schema';
import {
  extractImport,
  importKey,
  readImportParams,
  IMPORT_WORDS,
  type ImportAnswer,
  type ImportRequest,
} from '@livedoc/sheets';
import { allowWorkbookImports, readWorkbook } from '../db/workbook';
import { fetchPublicPage } from '../public-fetch';
import { forbidden, json, rateLimited } from '../responses';
import { relayWorkbook } from '../room-client';
import type { DocumentRouteContext } from './context';
import { sheetCaller, workbookRefused } from './sheet-route-kit';

// The fetch's bounds (D66): safe ranges 5 to 20 s, 1 to 10 MB, 3 to 10 redirects.
export const IMPORT_FETCH_MS = 10_000;
export const IMPORT_BYTES_MAX = 5 * 1024 * 1024;
export const IMPORT_REDIRECTS_MAX = 5;
// How long an answer is kept for everyone: Google's hourly refresh.
export const IMPORT_CACHE_S = 3_600;
const USER_AGENT = 'livedoc-import/1.0 (+https://docs.nu)';
const ACCEPT = 'text/html,application/xhtml+xml,application/xml,text/xml,text/csv,*/*;q=0.8';
// The cache's own address space: never fetched, only a key.
const CACHE_ORIGIN = 'https://sheet-imports.cache.invalid/';

function cacheStore(): Cache | null {
  return typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
}

async function cacheKey(request: ImportRequest): Promise<Request> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(importKey(request)),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request(`${CACHE_ORIGIN}${hex}`);
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

async function fetchAndRead(
  request: ImportRequest,
): Promise<{ answer: ImportAnswer; reason: string | null }> {
  const page = await fetchPublicPage(request.url, {
    timeoutMs: IMPORT_FETCH_MS,
    maxBytes: IMPORT_BYTES_MAX,
    maxRedirects: IMPORT_REDIRECTS_MAX,
    userAgent: USER_AGENT,
    accept: ACCEPT,
  });
  if (!page.ok)
    return {
      answer: { error: '#N/A', why: IMPORT_WORDS.notFetched(request.url) },
      reason: page.reason,
    };
  return { answer: extractImport(request, page), reason: null };
}

export async function fetchImport(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  if (ctx.env.SHEET_IMPORTS !== 'on') {
    console.info('[imports] refused', { documentId, reason: 'server_off' });
    return json({ error: '#N/A', why: IMPORT_WORDS.serverOff } satisfies ImportAnswer);
  }
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  if (!record.importsAllowed) return workbookRefused('imports_not_allowed', 403);
  const request = readImportParams(ctx.url.searchParams);
  if (!request) return workbookRefused('import_invalid', 400);
  const host = hostOf(request.url);
  const cache = cacheStore();
  const key = cache ? await cacheKey(request) : null;
  const fresh = ctx.url.searchParams.get('fresh') === '1';
  if (cache && key && !fresh) {
    const hit = await cache.match(key);
    if (hit) return json(await hit.json());
  }
  const limiter = ctx.env.SHEET_IMPORT_RATE_LIMITER;
  if (limiter && !(await limiter.limit({ key: `sheet-import:${documentId}` })).success) {
    console.info('[imports] refused', { documentId, host, reason: 'rate_limited' });
    return rateLimited();
  }
  const started = Date.now();
  const { answer, reason } = await fetchAndRead(request);
  const ms = Date.now() - started;
  if (reason) {
    console.warn('[imports] failed', { documentId, host, kind: request.kind, reason, ms });
    return json(answer);
  }
  console.info('[imports] fetched', {
    documentId,
    host,
    kind: request.kind,
    ms,
    ...('error' in answer ? { answer: answer.why } : { values: answer.rows.length }),
  });
  if (cache && key)
    ctx.waitUntil?.(
      cache.put(
        key,
        new Response(JSON.stringify(answer), {
          headers: {
            'content-type': 'application/json',
            'cache-control': `max-age=${IMPORT_CACHE_S}`,
          },
        }),
      ),
    );
  return json(answer);
}

export async function allowImports(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const allowed = await allowWorkbookImports(ctx.env, documentId, Date.now());
  if (!allowed) return workbookRefused('workbook_not_found', 404);
  const op: WorkbookRoomOp = { kind: 'workbook', ...allowed };
  ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
  console.info(`[workbook] imports allowed document=${documentId} rev=${allowed.rev}`);
  return json(allowed satisfies WorkbookSettingsResponse);
}
