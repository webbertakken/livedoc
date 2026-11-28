// A response as a Sheet row (docs/specs/030-forms/forms.md "Responses to a Sheet"): the sheet's header row and the rows
// in use read, the row planned by @livedoc/forms (responseRowWrite), and stored through the sheet store's own
// checks, caps and relay (storeSheetWrite), unchecked against the sheet's validation rules so a response always lands.
import { PROTECTION_SYSTEM } from '@livedoc/sheets';
import type { AnswerValue, FormPlanSheet, FormSheetDestination } from '@livedoc/forms';
import { isSpreadsheetSheet, responseRowWrite, type FormDefinition } from '@livedoc/forms';
import { cellKey, type SheetPerson } from '@livedoc/sheets';
import { documentLinksTab, readCells, readSheetHead, usedSheetRows } from '../db';
import type { DocumentRouteContext } from '../routes/context';
import { storeSheetWrite } from '../routes/sheet-write-route';
import { documentRoom } from '../document-room/document-client';

export type SheetRowOutcome = 'written' | 'missing' | 'full' | 'busy';

/** A response's row as a form sends it: to a Sheet tab of its own document, or to a spreadsheet's sheet. */
type FormRow = {
  // The form's document and Form tab.
  documentId: string;
  formTabId: string;
  sheet: FormSheetDestination;
  form: Pick<FormDefinition, 'sections'>;
  answers: ReadonlyMap<string, AnswerValue>;
  number: number | null;
  preview: boolean;
  by: SheetPerson;
};

// A spreadsheet's sheet is written in its own room, through the form's connection (spreadsheet-response.ts); a room
// that cannot be reached is busy, so the response is refused and sent again.
export async function writeFormRow(
  ctx: DocumentRouteContext,
  row: FormRow,
): Promise<SheetRowOutcome> {
  const { sheet } = row;
  if (!isSpreadsheetSheet(sheet)) return writeResponseRow(ctx, { ...row, sheet });
  try {
    return await documentRoom(ctx.env, sheet.documentId).writeFormResponse({
      form: { documentId: row.documentId, tabId: row.formTabId },
      sheetId: sheet.sheetId,
      sections: row.form.sections,
      answers: [...row.answers],
      number: row.number,
      preview: row.preview,
      by: row.by,
    });
  } catch (error) {
    console.warn('[forms] form.spreadsheet.unreached', { reason: String(error) });
    return 'busy';
  }
}

export async function writeResponseRow(
  ctx: DocumentRouteContext,
  input: {
    documentId: string;
    sheet: FormPlanSheet;
    form: Pick<FormDefinition, 'sections'>;
    answers: ReadonlyMap<string, AnswerValue>;
    number: number | null;
    preview: boolean;
    by: SheetPerson;
  },
): Promise<SheetRowOutcome> {
  const { env } = ctx;
  const { documentId, sheet } = input;
  const head = await readSheetHead(env, documentId, sheet.sheetId);
  if (!head || head.tabId !== sheet.tabId) return 'missing';
  if (!(await documentLinksTab(env, documentId, sheet.tabId))) return 'missing';
  const headerRow = head.layout.rows[0];
  const headerCells = headerRow
    ? await readCells(
        env,
        documentId,
        sheet.sheetId,
        head.layout.cols.map((c) => cellKey(headerRow, c)),
      )
    : [];
  const header = new Map<string, string>();
  for (const cell of headerCells) {
    const i = cell.i as { s?: unknown } | undefined;
    if (i && typeof i.s === 'string') header.set(cell.c, i.s);
  }
  const write = responseRowWrite({
    form: input.form,
    answers: input.answers,
    number: input.number,
    preview: input.preview,
    at: Date.now(),
    layout: head.layout,
    header,
    usedRows: await usedSheetRows(env, documentId, sheet.sheetId),
  });
  const res = await storeSheetWrite(
    ctx,
    documentId,
    sheet.sheetId,
    { write, unchecked: true },
    input.by,
    null,
    // A response row is written as the form's owner (data-tools.md "Protected ranges").
    PROTECTION_SYSTEM,
  );
  if (res.ok) return 'written';
  console.warn('[forms] form.sheet.unwritten', { documentId, status: res.status });
  return res.status === 413 ? 'full' : 'busy';
}
