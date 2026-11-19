// PUT /api/documents/<id>/workbook/settings: a spreadsheet's settings saved whole, as File › Settings' Save Settings
// writes them (docs/specs/029-sheets/sheet-store.md "Changing the workbook", settings.md). Editors only, never on a
// tab-scoped link; sent live as a `workbook` op. Answered inside the document's room.
import type { WorkbookRoomOp, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookSettings } from '@livedoc/sheets';
import { readWorkbook, saveWorkbookSettings } from '../db/workbook';
import { forbidden, json } from '../responses';
import { relayWorkbook } from '../room-client';
import { readBody, type DocumentRouteContext } from './context';
import { sheetCaller, workbookRefused } from './sheet-route-kit';

// Whether the runtime knows the locale and the time zone: a setting it cannot use is no setting.
function knownToIntl(settings: WorkbookSettings): boolean {
  try {
    Intl.getCanonicalLocales(settings.locale);
    new Intl.DateTimeFormat('en', { timeZone: settings.timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The settings a body carries, or null when they are not the workbook's settings. */
export function readSettingsBody(raw: Record<string, unknown> | Response): WorkbookSettings | null {
  if (raw instanceof Response) return null;
  const settings = WorkbookRecord.readSettings(raw.settings);
  return settings && knownToIntl(settings) ? settings : null;
}

export async function saveSettings(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'edit');
  if (caller instanceof Response) return caller;
  if (caller.scopeTab) return forbidden();
  const record = await readWorkbook(ctx.env, documentId);
  if (!record) return workbookRefused('workbook_not_found', 404);
  const settings = readSettingsBody(await readBody(ctx));
  if (!settings) return workbookRefused('settings_invalid', 400);
  const rev = await saveWorkbookSettings(ctx.env, documentId, settings, Date.now());
  if (rev === null) return workbookRefused('workbook_not_found', 404);
  const workbook: WorkbookRecord = { ...record, settings };
  const op: WorkbookRoomOp = { kind: 'workbook', workbook, rev };
  ctx.waitUntil?.(relayWorkbook(ctx.env, documentId, op));
  console.info(
    `[workbook] settings saved document=${documentId} rev=${rev} recalc=${settings.recalc} iterate=${settings.iterate.on}`,
  );
  const body: WorkbookSettingsResponse = { workbook, rev };
  return json(body);
}
