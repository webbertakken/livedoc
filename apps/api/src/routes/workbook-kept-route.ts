// A spreadsheet's kept content (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content), one word
// for both doors:
//   GET  /api/documents/<id>/workbook/kept  the kept content whole, entries' bytes as base64, or null. Read access, as
//        the file it is written into (Take offline reads it).
//   POST /api/documents/<id>/workbook/kept  one request's share of a file's kept content, added to what is stored
//        (File › Open and Sync to cloud send it right after their create). Edit access.
// Never on a tab-scoped link. Every refusal is named and stores nothing. Answered inside the document's room.
import type {
  KeptError,
  WorkbookKeptResponse,
  WorkbookKeptStoredResponse,
} from '@livedoc/api-schema';
import { keptFromWire, keptToWire } from '@livedoc/api-schema/workbook-kept';
import {
  KEPT_ITEM_MAX_BYTES,
  KEPT_MAX_BYTES,
  KEPT_PART_MAX_BYTES,
  keptBytes,
  keptItemBytes,
  keptPartBytes,
  keptRefusal,
  type KeptContent,
  type StoredAt,
} from '@livedoc/sheets/files';
import { isSpreadsheet } from '../db/workbook';
import { keptAddStatements, keptStored, readKept, type KeptStored } from '../db/workbook-kept';
import { bodyExceedsCap, MAX_BODY_BYTES } from '../limits';
import { forbidden, json } from '../responses';
import { readBody, type DocumentRouteContext } from './context';
import { sheetCaller, workbookRefused } from './sheet-route-kit';

const STATUS: Record<KeptError, number> = {
  kept_invalid: 400,
  kept_item_invalid: 400,
  kept_part_invalid: 400,
  kept_relationship_invalid: 400,
  kept_anchor_invalid: 400,
  kept_standard_mismatch: 409,
  kept_too_large: 413,
};

function keptRefused(
  documentId: string,
  error: KeptError,
  detail: Record<string, unknown> = {},
): Response {
  console.info('[workbook] refused', { error, documentId, ...detail });
  return json({ error }, { status: STATUS[error] });
}

export async function readKeptContent(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'read');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  if (!(await isSpreadsheet(ctx.env, documentId)))
    return workbookRefused('workbook_not_found', 404);
  const kept = await readKept(ctx.env, documentId);
  console.info(
    `[workbook] kept read document=${documentId} items=${kept?.items.length ?? 0} parts=${kept?.parts.length ?? 0}`,
  );
  const body: WorkbookKeptResponse = { kept: kept ? keptToWire(kept) : null };
  return json(body);
}

// What the request may not add to what is stored: its anchors, its standard, its entries' names, its sizes (D113).
function storeProblem(
  kept: KeptContent<StoredAt>,
  stored: KeptStored,
): { error: KeptError; why: string } | null {
  const sheets = [...kept.items, ...kept.relationships].map((entry) => entry.at.sheet);
  if (sheets.some((sheet) => sheet !== undefined && !stored.sheetIds.has(sheet)))
    return { error: 'kept_anchor_invalid', why: 'sheet' };
  if (stored.standard && stored.standard !== kept.standard)
    return { error: 'kept_standard_mismatch', why: stored.standard };
  if (kept.parts.some((part) => stored.partNames.has(part.name)))
    return { error: 'kept_part_invalid', why: 'stored' };
  if (kept.items.some((item) => keptItemBytes(item) > KEPT_ITEM_MAX_BYTES))
    return { error: 'kept_too_large', why: 'item' };
  if (kept.parts.some((part) => keptPartBytes(part) > KEPT_PART_MAX_BYTES))
    return { error: 'kept_too_large', why: 'part' };
  if (stored.bytes + keptBytes(kept) > KEPT_MAX_BYTES)
    return { error: 'kept_too_large', why: 'total' };
  return null;
}

export async function keepFileContent(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const body = await readBody(ctx);
  if (body instanceof Response) return keptRefused(documentId, 'kept_invalid', { why: 'json' });
  if (bodyExceedsCap(ctx.request, body, MAX_BODY_BYTES))
    return keptRefused(documentId, 'kept_too_large', { why: 'body' });
  const kept = keptFromWire(body);
  if (!kept) return keptRefused(documentId, 'kept_invalid', { why: 'shape' });
  const stored = await keptStored(ctx.env, documentId);
  if (!stored) return workbookRefused('workbook_not_found', 404);
  const refusal = keptRefusal(kept);
  if (refusal)
    return keptRefused(documentId, refusal.rejection, { at: refusal.at, why: refusal.why });
  const problem = storeProblem(kept, stored);
  if (problem) return keptRefused(documentId, problem.error, { why: problem.why });
  const bytes = keptBytes(kept);
  await ctx.env.DOCUMENT_DB.batch(keptAddStatements(ctx.env, documentId, kept, stored.next, bytes));
  const answer: WorkbookKeptStoredResponse = {
    standard: kept.standard,
    items: stored.next.items + kept.items.length,
    relationships: stored.next.relationships + kept.relationships.length,
    parts: stored.next.parts + kept.parts.length,
    bytes: stored.bytes + bytes,
  };
  console.info(
    `[workbook] kept stored document=${documentId} standard=${kept.standard} items=${kept.items.length} relationships=${kept.relationships.length} parts=${kept.parts.length} bytes=${bytes}`,
  );
  return json(answer);
}
