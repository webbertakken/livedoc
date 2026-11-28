// A form's response as a row of a spreadsheet's sheet (docs/specs/029-sheets/plan-links.md "Form responses", D506):
// answered in the spreadsheet's room, where the form's connection, the sheet and the spreadsheet are checked at each
// response, then written as a Sheet tab's row is (sheet-response.ts). No one's access is asked: the connection is it.
import type { AnswerValue, FormDefinition } from '@livedoc/forms';
import { WorkbookForms, type SheetPerson } from '@livedoc/sheets';
import { documentLinksTab, getDocument, readSheetHead } from '../db';
import { readWorkbook } from '../db/workbook';
import { documentRouteContext, NO_ONE_IDENTITY } from '../document-room/document-route';
import type { DocumentEnv } from '../types';
import { writeResponseRow, type SheetRowOutcome } from './sheet-response';

/** A form asking after its sheet in a spreadsheet: the form's document and Form tab, and the sheet. */
export type SpreadsheetFormAsk = {
  form: { documentId: string; tabId: string };
  sheetId: string;
};

/** A response's row as the form's room sends it: plain data, as a room call carries. */
export type SpreadsheetFormRow = SpreadsheetFormAsk & {
  sections: FormDefinition['sections'];
  answers: [string, AnswerValue][];
  number: number | null;
  preview: boolean;
  by: SheetPerson;
};

/** Why a form's rows cannot land in this spreadsheet now, or the sheet's tab when they can. */
export async function spreadsheetFormSheet(
  env: DocumentEnv,
  spreadsheetId: string,
  ask: SpreadsheetFormAsk,
): Promise<{ tabId: string } | { missing: 'spreadsheet' | 'connection' | 'sheet' }> {
  if (!(await getDocument(env, spreadsheetId))) return { missing: 'spreadsheet' };
  const record = await readWorkbook(env, spreadsheetId);
  if (!record) return { missing: 'spreadsheet' };
  if (!WorkbookForms.admits(record.forms, { ...ask.form, sheetId: ask.sheetId }))
    return { missing: 'connection' };
  const head = await readSheetHead(env, spreadsheetId, ask.sheetId);
  if (!head || !(await documentLinksTab(env, spreadsheetId, head.tabId)))
    return { missing: 'sheet' };
  return { tabId: head.tabId };
}

/** Whether the form's sheet holds, as the form's builder and publishing ask (logged when it does not). */
export async function spreadsheetFormSheetThere(
  env: DocumentEnv,
  spreadsheetId: string,
  ask: SpreadsheetFormAsk,
): Promise<boolean> {
  const found = await spreadsheetFormSheet(env, spreadsheetId, ask);
  if ('missing' in found)
    console.info('[forms] form.spreadsheet.missing', { spreadsheetId, missing: found.missing });
  return !('missing' in found);
}

export async function writeSpreadsheetFormRow(
  env: DocumentEnv,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  spreadsheetId: string,
  row: SpreadsheetFormRow,
): Promise<SheetRowOutcome> {
  const found = await spreadsheetFormSheet(env, spreadsheetId, row);
  if ('missing' in found) {
    console.warn('[forms] form.spreadsheet.unwritten', { spreadsheetId, missing: found.missing });
    return 'missing';
  }
  const request = new Request(`https://room/api/documents/${spreadsheetId}/workbook`);
  const ctx = documentRouteContext(env, request, NO_ONE_IDENTITY, waitUntil);
  const wrote = await writeResponseRow(ctx, {
    documentId: spreadsheetId,
    sheet: { tabId: found.tabId, sheetId: row.sheetId },
    form: { sections: row.sections },
    answers: new Map(row.answers),
    number: row.number,
    preview: row.preview,
    by: row.by,
  });
  console.info('[forms] form.spreadsheet.row', { spreadsheetId, outcome: wrote });
  return wrote;
}
