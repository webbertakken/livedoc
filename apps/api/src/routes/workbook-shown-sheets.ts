// The sheets a spreadsheet shows (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): its live sheets,
// those whose tab is in its tab list, in the tabs' order, less the hidden ones. The last one shown is never hidden or
// deleted (D177).
import type { LayoutChange, SheetWrite } from '@livedoc/sheets';
import { listSheetHeads, type SheetHead } from '../db';
import { documentTabOrder } from '../db/workbook';
import type { DocumentRouteContext } from './context';
import { sheetRejected } from './sheet-route-kit';

/** The workbook's sheets whose tabs are in its tab list, in the tabs' order. */
export async function liveSheets(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<SheetHead[]> {
  const [order, heads] = await Promise.all([
    documentTabOrder(ctx.env, documentId),
    listSheetHeads(ctx.env, documentId),
  ]);
  const at = new Map(order.map((id, i) => [id, i]));
  return heads.filter((h) => at.has(h.tabId)).sort((a, b) => at.get(a.tabId)! - at.get(b.tabId)!);
}

/** Whether a live sheet other than `sheetId` is shown. */
export function shownElsewhere(live: readonly SheetHead[], sheetId: string): boolean {
  return live.some((h) => h.id !== sheetId && h.layout.hidden !== true);
}

type Options = Extract<LayoutChange, { k: 'options' }>;

// The options changes of a write that colour or hide the sheet's tab.
function tabLooksOf(write: SheetWrite): Options[] {
  if (write.kind !== 'layout') return [];
  return write.changes.filter(
    (ch): ch is Options =>
      ch.k === 'options' && (ch.hidden !== undefined || ch.tabColour !== undefined),
  );
}

/** A write's tab look refused: a Plan Sheet has no tab of its own to look, and the last sheet shown stays shown. */
export async function tabLookProblem(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
  write: SheetWrite,
  spreadsheet: boolean,
): Promise<Response | null> {
  const looks = tabLooksOf(write);
  if (!looks.length) return null;
  if (!spreadsheet) return sheetRejected('write_invalid');
  if (
    !looks.some((ch) => ch.hidden === true) ||
    shownElsewhere(await liveSheets(ctx, documentId), sheetId)
  )
    return null;
  console.info('[workbook] refused', { error: 'sheet_last_visible', sheetId });
  return sheetRejected('sheet_last_visible', 409);
}
