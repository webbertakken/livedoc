// PUT /api/documents/<id>/workbook/functions: a spreadsheet's named functions saved whole, as Data › Named Functions
// writes them (docs/specs/029-sheets/sheet-store.md "Changing the workbook", data-tools.md "Named ranges and named
// functions"). Editors only, never on a tab-scoped link; sent live as a `workbook` op. Each function is checked by the
// rules the panel checks; a definition is parsed, never run. Answered inside the document's room.
import type { WorkbookRoomOp, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { NAMED_FUNCTIONS_MAX, readNamedFunctions, type NamedFunction } from '@livedoc/sheets';
import { readWorkbook, saveWorkbookFunctions } from '../db/workbook';
import { forbidden, json } from '../responses';
import { relayWorkbook } from '../room-client';
import { readBody, type DocumentRouteContext } from './context';
import { sheetCaller, workbookRefused } from './sheet-route-kit';

/** The functions a body carries, `full` past the bound, or null when they are not a list of well made ones. */
export function readFunctionsBody(
  raw: Record<string, unknown> | Response,
): NamedFunction[] | 'full' | null {
  if (raw instanceof Response || !Array.isArray(raw.functions)) return null;
  if (raw.functions.length > NAMED_FUNCTIONS_MAX) return 'full';
  return readNamedFunctions(raw.functions);
}

export async function saveFunctions(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  if (!(await readWorkbook(ctx.env, documentId))) return workbookRefused('workbook_not_found', 404);
  const functions = readFunctionsBody(await readBody(ctx));
  if (functions === 'full') return workbookRefused('functions_full', 413);
  if (!functions) return workbookRefused('functions_invalid', 400);
  const saved = await saveWorkbookFunctions(ctx.env, documentId, functions, Date.now());
  if (!saved) return workbookRefused('workbook_not_found', 404);
  const op: WorkbookRoomOp = { kind: 'workbook', workbook: saved.workbook, rev: saved.rev };
  ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
  console.info(
    `[workbook] named functions saved document=${documentId} rev=${saved.rev} count=${functions.length}`,
  );
  const body: WorkbookSettingsResponse = saved;
  return json(body);
}
