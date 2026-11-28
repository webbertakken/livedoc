// The comment verbs on a spreadsheet (docs/specs/029-sheets/review.md "Agents"): the ref names a sheet (its title or
// id), `--cell B4` or `--range B4:C9` the cells; a thread is found by its anchor's top-left cell and written through the
// sheet's threads route, as the grid's card writes it. Listing reads the workbook's threads, each labelled by its
// sheet and range.
import { ApiError } from '@livedoc/api-client';
import type {
  SheetThreadResponse,
  SheetThreadsResponse,
  CommentListStatus,
} from '@livedoc/api-schema';
import type { SheetThread, SheetThreadAnchor, SheetThreadOp } from '@livedoc/document';
import {
  formatRange,
  parseRangeText,
  threadAnchorAt,
  threadPlaceLabel,
  type GridRange,
} from '@livedoc/sheets';
import { VerbRefusal, type VerbContext } from '../define';
import { readSheetsState, resolveSheet } from '../sheets/sheet-state';
import { SHEET_REFUSAL_WORDS } from '../sheets/sheet-refusals';
import type { DocumentWithTabs } from './shared';

/** Whether a document is a spreadsheet: its tabs all sheets, and a workbook behind them. */
export async function isSpreadsheetDocument(
  ctx: VerbContext,
  document: DocumentWithTabs,
): Promise<boolean> {
  if (document.tabs.length === 0 || !document.tabs.every((t) => t.kind === 'sheet')) return false;
  return (await readSheetsState(ctx.api, document.id)).workbook !== null;
}

export type SheetTarget = {
  documentId: string;
  sheetId: string;
  title: string;
  // The cells named, and their anchor by row and column ids.
  range: GridRange;
  anchor: SheetThreadAnchor;
  // How the verbs name the place: `Budget!B4:C9`.
  place: string;
};

const threadsPath = (documentId: string) =>
  `/documents/${encodeURIComponent(documentId)}/sheet-threads`;
const opPath = (t: SheetTarget) =>
  `/documents/${encodeURIComponent(t.documentId)}/sheets/${encodeURIComponent(t.sheetId)}/threads`;

/** The sheet the ref names and the cells `--cell` or `--range` name on it; refused as the sheet verbs refuse. */
export async function sheetTargetOf(
  ctx: VerbContext,
  documentId: string,
  ref: string,
  where: { cell?: string | undefined; range?: string | undefined },
): Promise<SheetTarget> {
  const a1 = where.range ?? where.cell;
  if (a1 === undefined)
    throw new VerbRefusal({
      status: 400,
      code: 'cell_needed',
      message: `a spreadsheet's comment is on cells: name them with --cell or --range`,
      hint: `livedoc comment add <doc> ${JSON.stringify(ref)} --cell B4 "<text>"`,
    });
  const state = await readSheetsState(ctx.api, documentId);
  const found = resolveSheet(state.sheets, ref);
  if (!found.ok)
    throw new VerbRefusal({
      status: 404,
      code: found.code,
      message: found.message,
      hint: 'list the sheets with: livedoc sheet ls <doc>',
    });
  const { layout, id, title } = found.sheet;
  const range = parseRangeText(a1);
  const [r1, c1, r2, c2] = range
    ? [layout.rows[range.r1], layout.cols[range.c1], layout.rows[range.r2], layout.cols[range.c2]]
    : [];
  if (!range || !r1 || !c1 || !r2 || !c2)
    throw new VerbRefusal({
      status: 400,
      code: 'cell_not_found',
      message: `no cell ${a1} on ${JSON.stringify(title)}`,
      hint: 'name a cell or range by A1 inside the sheet, such as B4 or B4:C9',
    });
  return {
    documentId,
    sheetId: id,
    title,
    range,
    anchor: { r1, c1, r2, c2 },
    place: `${title}!${formatRange(range)}`,
  };
}

/** The workbook's threads, as the caller may read them (a Viewer reads none). */
export async function workbookThreads(
  ctx: VerbContext,
  documentId: string,
): Promise<SheetThread[]> {
  return (await ctx.api.json<SheetThreadsResponse>(threadsPath(documentId))).threads;
}

/** The thread anchored at the target's top-left cell: an open one first, else the latest resolved one. */
export async function threadAtTarget(
  ctx: VerbContext,
  t: SheetTarget,
): Promise<SheetThread | null> {
  const here = (await workbookThreads(ctx, t.documentId)).filter(
    (x) => x.sheetId === t.sheetId && x.anchor.r1 === t.anchor.r1 && x.anchor.c1 === t.anchor.c1,
  );
  const begun = (x: SheetThread) => x.comments[0]?.at ?? 0;
  return (
    here.filter((x) => !x.resolved).sort((a, b) => begun(a) - begun(b))[0] ??
    here.sort((a, b) => begun(b) - begun(a))[0] ??
    null
  );
}

/** One op on the target's sheet; a refusal in the sheet verbs' words. */
export async function sendSheetThreadOp(
  ctx: VerbContext,
  t: SheetTarget,
  op: SheetThreadOp,
): Promise<SheetThreadResponse> {
  try {
    return await ctx.api.json<SheetThreadResponse>(opPath(t), {
      method: 'POST',
      body: JSON.stringify({ op }),
    });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    const words = code ? SHEET_REFUSAL_WORDS[code as keyof typeof SHEET_REFUSAL_WORDS] : undefined;
    if (!(error instanceof ApiError) || !words) throw error;
    throw new VerbRefusal({
      status: error.status,
      code: code!,
      message: words,
      hint: 'read the threads again with: livedoc comment ls <doc>',
    });
  }
}

/** The refusal for cells with no thread to act on. */
export function noSheetThread(t: SheetTarget, ref: string): VerbRefusal {
  return new VerbRefusal({
    status: 404,
    code: 'no_thread',
    message: `no thread on ${t.place}`,
    hint: `start one: livedoc comment add <doc> ${JSON.stringify(ref)} --cell ${formatRange(t.range).split(':')[0]} "<text>"`,
  });
}

/** A spreadsheet's threads as `comment ls` lists them, each labelled by its sheet and range. */
export async function sheetThreadListing(
  ctx: VerbContext,
  documentId: string,
  status: CommentListStatus,
  tabId: string | null,
) {
  const [threads, state] = await Promise.all([
    workbookThreads(ctx, documentId),
    readSheetsState(ctx.api, documentId),
  ]);
  const sheets = new Map(state.sheets.map((s) => [s.id, s]));
  return threads
    .filter((t) => (status === 'all' ? true : status === 'resolved' ? t.resolved : !t.resolved))
    .flatMap((t) => {
      const sheet = sheets.get(t.sheetId);
      if (!sheet || (tabId !== null && sheet.tabId !== tabId)) return [];
      const at = threadAnchorAt(sheet.layout, t.anchor);
      return [
        {
          tabId: sheet.tabId,
          tabName: sheet.title,
          elementId: t.id,
          ref: sheet.title,
          label: threadPlaceLabel(sheet.title, sheet.layout, t.anchor),
          ...('deleted' in at ? {} : { cell: formatRange(at) }),
          resolved: t.resolved,
          comments: t.comments.map((c) => ({
            id: c.id,
            authorName: c.author.name,
            createdAt: c.at,
            text: c.text,
          })),
        },
      ];
    });
}
