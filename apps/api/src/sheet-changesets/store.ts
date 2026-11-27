// A sheet changeset stored (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D262-D270): its writes
// planned by the engine against the sheet as stored (planSheetChangeset), checked whole against the caps, and stored
// in one batch guarded by the sheet's revision, which advances by one per write; recorded with its inverse and
// after-image in the same batch, and relayed as that many sheet writes in order. A lost race plans again.
import type {
  SheetChangesetResponse,
  SheetChangesetWritten,
  SheetsRoomOp,
} from '@livedoc/api-schema';
import {
  SheetLimits,
  cellsFromJson,
  planSheetChangeset,
  type ProtectionCaller,
  type SheetPerson,
  type SheetWrite,
} from '@livedoc/sheets';
import {
  axisDeleteStatement,
  cellWriteStatements,
  documentSavedStatement,
  headWriteStatement,
  listSheets,
  readCells,
  readSheetHead,
  recountStatement,
} from '../db';
import { axisWriteStatements } from '../db/sheet-axes';
import { insertSheetChangesetStatements } from '../db/sheet-changesets';
import { sheetTabRenameStatement } from '../db/tabs';
import { isSpreadsheet } from '../db/workbook';
import { mintSheetChangesetId } from '../changesets/changeset-id';
import { afterChangeset } from '../changesets/after';
import type { FrontDoor } from '../changesets/front-door';
import type { Author } from '../changesets/write';
import { relayTabRename } from '../room-client';
import type { DocumentRouteContext } from '../routes/context';
import { SHEET_WRITE_RETRIES, relaySheetsInOrder } from '../routes/sheet-route-kit';
import { capsProblem, deletes, gridProblem, titleProblem } from '../routes/sheet-write-checks';
import { shrinkReaders } from '../routes/sheet-write-route';
import { tabLookProblem } from '../routes/workbook-shown-sheets';

export type SheetChangesetResult = { status: number; body: unknown };

export type StoreArgs = {
  ctx: DocumentRouteContext;
  documentId: string;
  sheetId: string;
  writes: readonly SheetWrite[];
  summary: string | null;
  // The sheet revision read, and whether a newer sheet refuses the changeset (D263).
  rev: number | null;
  strict: boolean;
  by: SheetPerson;
  author: Author;
  tokenId: string | null;
  scopeTab: string | null;
  frontDoor: FrontDoor;
  // A revert's: the changeset it reverts, its writes stored as an undo is (never refused by validation rules).
  revertOf: string | null;
  // Who writes, to the sheet's protections (data-tools.md "Protected ranges").
  caller: ProtectionCaller;
};

const refusal = (status: number, body: Record<string, unknown>): SheetChangesetResult => ({
  status,
  body,
});

// A Response refusal (the write route's own checks) as a result.
async function asResult(res: Response): Promise<SheetChangesetResult> {
  return { status: res.status, body: await res.json() };
}

export function sheetChangesetLog(
  event: 'applied' | 'refused' | 'stale' | 'reverted' | 'nothing',
  fields: Record<string, unknown>,
): void {
  console.info(`[sheet-changeset] ${event}`, fields);
}

// The cells the writes name, and every cell of the sheet when one deletes rows or columns (its shrinks and its
// inverse read them).
async function cellsFor(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
  writes: readonly SheetWrite[],
) {
  if (writes.some(deletes))
    return cellsFromJson(
      (await listSheets(ctx.env, documentId, { ids: [sheetId] }))[0]?.cells ?? [],
    );
  const keys = new Set<string>();
  for (const w of writes)
    if (w.kind !== 'title') for (const ch of w.cells ?? []) keys.add(`${ch.r}:${ch.c}`);
  return cellsFromJson(await readCells(ctx.env, documentId, sheetId, [...keys]));
}

export async function storeSheetChangeset(args: StoreArgs): Promise<SheetChangesetResult> {
  const { ctx, documentId, sheetId, writes } = args;
  const where = { documentId, sheetId, writes: writes.length };
  for (let attempt = 0; attempt < SHEET_WRITE_RETRIES; attempt++) {
    const head = await readSheetHead(ctx.env, documentId, sheetId);
    if (!head || (args.scopeTab && head.tabId !== args.scopeTab))
      return refusal(404, { error: 'sheet_not_found' });
    if (args.rev !== null && args.rev > head.rev)
      return refusal(400, {
        error: 'invalid_base',
        message: `rev ${args.rev} is newer than the sheet's ${head.rev}`,
      });
    if (args.strict && args.rev !== head.rev) {
      sheetChangesetLog('stale', { ...where, read: args.rev, now: head.rev });
      return refusal(412, { error: 'stale_sheet', rev: head.rev });
    }
    const spreadsheet = await isSpreadsheet(ctx.env, documentId);
    const scope = spreadsheet ? undefined : head.tabId;
    const limits = SheetLimits.of(spreadsheet);
    for (const write of writes) {
      const look = await tabLookProblem(ctx, documentId, sheetId, write, spreadsheet);
      if (look) return asResult(look);
      if (write.kind === 'title') {
        const titled = await titleProblem(
          ctx,
          documentId,
          sheetId,
          write.title,
          spreadsheet,
          scope,
        );
        if (titled) return asResult(titled);
      }
    }
    const light = { ...head, cells: await cellsFor(ctx, documentId, sheetId, writes) };
    const now = Date.now();
    const plan = planSheetChangeset(light, writes, {
      now,
      by: args.by,
      check: { checkRules: args.revertOf === null, limits },
      caller: args.caller,
    });
    if (!plan.ok) {
      sheetChangesetLog('refused', { ...where, error: plan.error, index: plan.index });
      const { error, index, at, line } = plan;
      if (error === 'protected')
        console.info('[sheets] protection.refused', { documentId, protection: at, index });
      const status = error === 'sheet_too_large' ? 413 : error === 'protected' ? 403 : 400;
      return refusal(status, {
        error,
        index,
        ...(at ? { at } : {}),
        ...(line ? { line } : {}),
      });
    }
    // An agent is never asked a warning: it writes, and the room says so (D346).
    if (plan.warned.length > 0)
      console.info('[sheets] protection.warned', { documentId, sheetId, protections: plan.warned });
    if (!plan.changes) {
      sheetChangesetLog('nothing', where);
      return { status: 200, body: { changeset: null, rev: head.rev, applied: [] } };
    }
    const caps = await capsProblem(ctx, documentId, head, plan.net, limits);
    if (caps) return asResult(caps);
    const grid = spreadsheet ? await gridProblem(ctx, documentId, head, plan.sheet, limits) : null;
    if (grid) return asResult(grid);

    const nonce = crypto.randomUUID();
    const steps = plan.applied.length;
    const layoutMoved = plan.sheet.layout !== head.layout;
    const titled = plan.sheet.title !== head.title;
    const written: SheetChangesetWritten = {
      id: mintSheetChangesetId(),
      sheetId,
      tabId: head.tabId,
      rev: head.rev + steps,
      previousRev: head.rev,
      counts: plan.counts,
    };
    const statements = [
      headWriteStatement(ctx.env, documentId, sheetId, head.rev, nonce, now, args.by, {
        steps,
        ...(layoutMoved ? { layout: plan.sheet.layout } : {}),
        ...(titled ? { title: plan.sheet.title } : {}),
      }),
    ];
    if (layoutMoved)
      statements.push(
        ...axisWriteStatements(ctx.env, documentId, sheetId, head.axes, plan.sheet.layout, nonce),
      );
    for (const applied of plan.applied)
      if (applied.kind === 'layout')
        for (const ch of applied.changes)
          if (ch.k === 'deleteRows' || ch.k === 'deleteCols')
            statements.push(
              axisDeleteStatement(
                ctx.env,
                documentId,
                sheetId,
                nonce,
                ch.k === 'deleteRows' ? 'r' : 'c',
                ch.ids,
              ),
            );
    statements.push(...cellWriteStatements(ctx.env, documentId, sheetId, nonce, plan.net));
    statements.push(recountStatement(ctx.env, documentId, sheetId));
    statements.push(documentSavedStatement(ctx.env, documentId, sheetId, nonce, now));
    if (spreadsheet && titled)
      statements.push(
        sheetTabRenameStatement(
          ctx.env,
          { tabId: head.tabId, name: plan.sheet.title, at: now },
          { documentId, sheetId, nonce },
        ),
      );
    statements.push(
      ...insertSheetChangesetStatements(
        ctx.env,
        {
          id: written.id,
          documentId,
          sheetId,
          tabId: head.tabId,
          rev: written.rev,
          previousRev: head.rev,
          authorId: args.author.id,
          authorName: args.author.name,
          authorColor: args.author.color,
          tokenId: args.tokenId,
          summary: args.summary,
          counts: plan.counts,
          revertOf: args.revertOf,
          createdAt: now,
        },
        nonce,
        {
          writes: JSON.stringify(plan.applied),
          inverse: JSON.stringify(plan.inverse),
          after: JSON.stringify(plan.after),
        },
      ),
    );
    const results = await ctx.env.DOCUMENT_DB.batch(statements);
    if ((results[0]?.results ?? []).length === 0) {
      console.info('[sheet-changeset] retry', { ...where, attempt });
      continue;
    }
    const ops: SheetsRoomOp[] = plan.applied.map((applied, i) => ({
      kind: 'sheets',
      sheetId,
      tabId: head.tabId,
      rev: head.rev + i + 1,
      applied,
      at: now,
      by: args.by,
    }));
    relaySheetsInOrder(ctx, documentId, ops);
    if (spreadsheet && titled)
      await relayTabRename(ctx.env, documentId, head.tabId, plan.sheet.title);
    for (const applied of plan.applied)
      if (applied.kind === 'layout' && deletes(applied))
        await shrinkReaders(ctx, documentId, head, applied.changes, args.by, scope);
    sheetChangesetLog(args.revertOf ? 'reverted' : 'applied', {
      ...where,
      id: written.id,
      rev: written.rev,
      cells: plan.net.length,
    });
    // An agent's changeset, and any revert, as a tab changeset reports them.
    if (args.tokenId || args.revertOf)
      ctx.waitUntil?.(
        afterChangeset.telemetry(ctx.env, args.revertOf ? 'Reverted' : 'Applied', args.frontDoor),
      );
    const body: SheetChangesetResponse = {
      changeset: written,
      rev: written.rev,
      applied: plan.applied,
    };
    return { status: 200, body };
  }
  return refusal(409, { error: 'sheet_busy' });
}
