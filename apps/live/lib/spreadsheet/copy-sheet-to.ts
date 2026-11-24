// Copy To (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D183, D184): a sheet carried whole into a
// new spreadsheet, or last into one the person picked, its other sheets named in formulas by their names. It goes as
// a file opened goes: the first request carries what it can, the rest follows as writes (send-file-parts.ts); a part
// refused takes the half-made copy back out, or bins the new spreadsheet, and says the copy failed.
import {
  SheetName,
  WorkbookRecord,
  makeSheetId,
  sheetCopyOf,
  type Sheet,
  type SheetsCtx,
} from '@livedoc/sheets';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { apiAddWorkbookSheet, apiDeleteWorkbookSheet } from '@/lib/api/workbook-sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { sheetRefusalMessage } from '@/components/sheets/sheet-refusals';
import { sendFileParts, type PartsProgress } from './send-file-parts';
import { newSheetTab } from './spreadsheet-document';
import { UNTITLED_SPREADSHEET } from './spreadsheet-name';

/** Where a copy goes: a new spreadsheet, or one the person picked by its id and name. */
export type CopyToTarget = { kind: 'new' } | { kind: 'existing'; documentId: string; name: string };

/** The sheet copied, the spreadsheet it is in and its record (whose format and settings a new one takes). */
export type CopySource = { sheet: Sheet; ctx: SheetsCtx; record: WorkbookRecord };

export type CopiedSheet =
  { ok: true; documentId: string; name: string } | { ok: false; message: string };

const COPY_FAILED = 'The sheet could not be copied. Try again.';

// What a refused copy says: a named refusal in a spreadsheet's words, else that it failed.
function failed(error: unknown): CopiedSheet {
  const code = error instanceof ApiError ? error.code : null;
  debugLog('[workbook] copy to refused', { code });
  const words = sheetRefusalMessage(code, true);
  return { ok: false, message: words === sheetRefusalMessage(null) ? COPY_FAILED : words };
}

export async function copySheetTo(
  ownerId: string,
  source: CopySource,
  target: CopyToTarget,
  onProgress: PartsProgress,
): Promise<CopiedSheet> {
  const files = await import('@livedoc/sheets/files');
  const title = SheetName.fit(`Copy of ${source.sheet.title}`, []);
  const copy = sheetCopyOf(source.sheet, source.ctx, { id: makeSheetId(), title });
  const parts = files.fileParts([copy]);
  const seed = parts.seeds[0]!;
  const tabId = crypto.randomUUID();
  const done = (documentId: string, name: string): CopiedSheet => {
    debugLog('[workbook] copy to', { target: target.kind, parts: parts.parts.length });
    track('Sheet', 'Changed', 'CopySheet');
    return { ok: true, documentId, name };
  };
  if (target.kind === 'new') {
    const documentId = crypto.randomUUID();
    let created = false;
    try {
      await apiCreateDocument(ownerId, {
        id: documentId,
        name: UNTITLED_SPREADSHEET,
        tabs: [newSheetTab(tabId, title)],
        sheets: [{ id: seed.id, tabId, title, layout: seed.layout, cells: seed.cells }],
        workbook: WorkbookRecord.copied(source.record),
      });
      created = true;
      await sendFileParts({ ownerId, documentId, shareCode: null, tabId: null }, parts, onProgress);
      return done(documentId, UNTITLED_SPREADSHEET);
    } catch (error) {
      if (created)
        await apiDeleteDocument(ownerId, documentId).catch((e: unknown) => {
          debugLog('[workbook] half-made copy not binned', { error: String(e) });
        });
      return failed(error);
    }
  }
  const scope = { ownerId, documentId: target.documentId, shareCode: null };
  let added = false;
  try {
    await apiAddWorkbookSheet(scope, {
      tabId,
      sheetId: seed.id,
      name: title,
      seed: { layout: seed.layout, cells: seed.cells },
    });
    added = true;
    await sendFileParts({ ...scope, tabId: null }, parts, onProgress);
    return done(target.documentId, target.name);
  } catch (error) {
    if (added)
      await apiDeleteWorkbookSheet(scope, seed.id).catch((e: unknown) => {
        debugLog('[workbook] half-made copy not taken out', { error: String(e) });
      });
    return failed(error);
  }
}
