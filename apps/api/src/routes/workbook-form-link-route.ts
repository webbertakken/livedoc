// The forms a spreadsheet takes responses from (docs/specs/029-sheets/plan-links.md "Form responses", D506):
//   POST   /api/documents/<id>/workbook/link { document, tab, sheet }   a form connected to a sheet (an Editor of both)
//   DELETE /api/documents/<id>/workbook/link?document=<id>&tab=<id>     a form's connection taken back (an Editor of either)
//   DELETE /api/documents/<id>/workbook/link?sheet=<sheetId>            every connection to a sheet (Unlink Form)
// The connection is kept on the workbook and sent live to everyone on it; each response checks it in this room
// (forms/spreadsheet-response.ts). Never through a tab-scoped link.
import type { WorkbookRoomOp, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { SHEET_ID_PATTERN, WorkbookForms, type WorkbookForm } from '@livedoc/sheets';
import { documentLinksTab, readSheetHead } from '../db';
import { readWorkbook, saveWorkbookForms } from '../db/workbook';
import { forbidden, json } from '../responses';
import { relayWorkbook } from '../room-client';
import type { DocumentRouteContext } from './context';
import { sheetCaller, sheetNotFound, workbookRefused } from './sheet-route-kit';

/** How many times a connection is tried again when another Editor's landed meanwhile. Safe range 2 to 8. */
const FORM_LINK_TRIES = 4;

const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** A connect body as a form's connection, or null when it names no form and sheet. */
export function readFormLinkBody(body: unknown): WorkbookForm | null {
  if (typeof body !== 'object' || body === null) return null;
  const { document, tab, sheet } = body as Record<string, unknown>;
  if (typeof document !== 'string' || !ID_RE.test(document)) return null;
  if (typeof tab !== 'string' || !ID_RE.test(tab)) return null;
  if (typeof sheet !== 'string' || !SHEET_ID_PATTERN.test(sheet)) return null;
  return { documentId: document, tabId: tab, sheetId: sheet };
}

// Whether the caller may edit the document, wholly (never through a tab-scoped link).
async function mayEdit(ctx: DocumentRouteContext, documentId: string): Promise<boolean> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  return !(caller instanceof Response) && !caller.scopeTab;
}

// The forms changed by `change`, written against what they were, read again when another write landed first.
async function changeForms(
  ctx: DocumentRouteContext,
  documentId: string,
  change: (forms: readonly WorkbookForm[] | undefined) => WorkbookForm[] | null,
): Promise<Response> {
  for (let attempt = 0; attempt < FORM_LINK_TRIES; attempt++) {
    const record = await readWorkbook(ctx.env, documentId);
    if (!record) return workbookRefused('workbook_not_found', 404);
    const next = change(record.forms);
    if (!next) return workbookRefused('forms_full', 409);
    const saved = await saveWorkbookForms(ctx.env, documentId, record.forms, next, Date.now());
    if (!saved) continue;
    const op: WorkbookRoomOp = { kind: 'workbook', ...saved };
    ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
    console.info(
      `[workbook] forms saved document=${documentId} from=${record.forms?.length ?? 0} to=${next.length}`,
    );
    return json(saved satisfies WorkbookSettingsResponse);
  }
  console.warn(`[workbook] forms busy document=${documentId}`);
  return workbookRefused('forms_full', 409);
}

export async function connectForm(
  ctx: DocumentRouteContext,
  documentId: string,
  body: unknown,
): Promise<Response> {
  const form = readFormLinkBody(body);
  if (!form || form.documentId === documentId) return workbookRefused('form_link_invalid', 400);
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  if (!(await mayEdit(ctx, form.documentId))) {
    console.info(`[workbook] form link refused document=${documentId} reason=form_permission`);
    return forbidden();
  }
  const head = await readSheetHead(ctx.env, documentId, form.sheetId);
  if (!head || !(await documentLinksTab(ctx.env, documentId, head.tabId))) return sheetNotFound();
  return changeForms(ctx, documentId, (forms) => WorkbookForms.connect(forms, form));
}

export async function unlinkForm(ctx: DocumentRouteContext, documentId: string): Promise<Response> {
  const q = ctx.url.searchParams;
  const sheet = q.get('sheet');
  const document = q.get('document');
  const tab = q.get('tab');
  if (sheet !== null) {
    if (!SHEET_ID_PATTERN.test(sheet)) return workbookRefused('form_link_invalid', 400);
    if (!(await mayEdit(ctx, documentId))) return forbidden();
    return changeForms(ctx, documentId, (forms) => WorkbookForms.unlink(forms, { sheetId: sheet }));
  }
  if (!document || !ID_RE.test(document) || !tab || !ID_RE.test(tab))
    return workbookRefused('form_link_invalid', 400);
  // The form's own Editor takes its connection back when it chooses elsewhere, though they may not edit this one.
  if (!(await mayEdit(ctx, documentId)) && !(await mayEdit(ctx, document))) return forbidden();
  const form = { documentId: document, tabId: tab };
  return changeForms(ctx, documentId, (forms) => WorkbookForms.unlink(forms, { form }));
}
