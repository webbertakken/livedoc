// A sheet's changesets over REST (docs/specs/024-agents/agent-changesets.md "A sheet's changesets"):
//   POST /api/documents/<id>/sheets/<sheetId>/changesets     submit (D262)
//   GET  /api/documents/<id>/changesets/<sc_…>               one (through routes/changesets.ts)
//   POST /api/documents/<id>/changesets/<sc_…>/revert        its inverse, less what changed since (D266)
import { protectionCallerOf } from '../routes/sheet-protection';
import type { ChangesetSummary, SheetRevertResponse } from '@livedoc/api-schema';
import {
  cellsFromJson,
  planSheetRevert,
  valuesOnly,
  writesFormats,
  type SheetChangesetAfter,
  type SheetWrite,
} from '@livedoc/sheets';
import { listSheets, readCells, readSheetHead } from '../db';
import { getSheetChangesetParts, type SheetChangesetRecord } from '../db/sheet-changesets';
import { frontDoorOf } from '../changesets/front-door';
import { forbidden, json, notFound } from '../responses';
import type { DocumentDTO } from '../types';
import { gateEdit, gateRead, tabScopeOf, type DocumentRouteContext } from '../routes/context';
import { authorOf, refreshAfterWrite } from '../routes/changesets';
import { writer } from '../routes/item-route-kit';
import { sheetCaller, sheetCallerEdits } from '../routes/sheet-route-kit';
import { deletes } from '../routes/sheet-write-checks';
import { parseSheetChangeset } from './request';
import { sheetChangesetLog, storeSheetChangeset, type SheetChangesetResult } from './store';

const respond = (r: SheetChangesetResult) => json(r.body, { status: r.status });

const keptOf = (keys: readonly string[]): SheetRevertResponse['kept'] =>
  keys.map((id) => ({ id, reason: 'changed' }));

// A Participant's writes cut to their values (D262): one of rows, columns, layout or a title, or of formats alone,
// refused; null then.
function participantWrites(writes: readonly SheetWrite[]): SheetWrite[] | null {
  const out: SheetWrite[] = [];
  for (const w of writes) {
    if (w.kind !== 'cells') return null;
    const values = writesFormats(w) ? valuesOnly(w) : w;
    if (!values) return null;
    out.push(values);
  }
  return out;
}

export async function submitSheetChangeset(
  ctx: DocumentRouteContext,
  documentId: string,
  sheetId: string,
): Promise<Response> {
  const caller = await sheetCaller(ctx, documentId, 'participate');
  if (caller instanceof Response) return caller;
  const parsed = parseSheetChangeset(await ctx.request.text());
  if (!parsed.ok) return json(parsed.refused.body, { status: parsed.refused.status });
  let writes = parsed.value.writes;
  if (!(await sheetCallerEdits(ctx, caller))) {
    const values = participantWrites(writes);
    if (!values) return forbidden();
    writes = values;
  }
  const [by, author] = await Promise.all([writer(ctx, caller.owner), authorOf(ctx, caller.owner)]);
  const who = () => protectionCallerOf(ctx, caller, caller.owner);
  const result = await storeSheetChangeset({
    ctx,
    documentId,
    sheetId,
    writes,
    summary: parsed.value.summary,
    rev: parsed.value.rev,
    strict: parsed.value.strict,
    by,
    author,
    tokenId: ctx.token?.id ?? null,
    scopeTab: caller.scopeTab,
    frontDoor: frontDoorOf(ctx.request),
    revertOf: null,
    caller: who,
  });
  const tabId = (result.body as { changeset?: { tabId?: string } | null }).changeset?.tabId;
  if (tabId)
    refreshAfterWrite(
      ctx,
      { id: documentId, ownerId: caller.ownerId, teamId: caller.teamId },
      tabId,
      author,
      result,
    );
  return respond(result);
}

export function sheetChangesetSummary(
  record: SheetChangesetRecord,
  viewer: string,
): ChangesetSummary {
  return {
    id: record.id,
    tabId: record.tabId,
    sheetId: record.sheetId,
    rev: record.rev,
    author: { name: record.authorName, color: record.authorColor },
    agent: record.tokenId !== null,
    ...(record.tokenId !== null && record.authorId === viewer ? { tokenId: record.tokenId } : {}),
    summary: record.summary,
    counts: record.counts,
    revertOf: record.revertOf,
    createdAt: record.createdAt,
  };
}

export async function showSheetChangeset(
  ctx: DocumentRouteContext,
  document: DocumentDTO,
  record: SheetChangesetRecord,
  owner: string,
): Promise<Response> {
  if (!(await gateRead(ctx, document.id, document.ownerId, document.teamId, record.tabId)))
    return notFound();
  const { counts } = record;
  const text = `${counts.added} cells added, ${counts.changed} changed, ${counts.removed} removed`;
  return json({ changeset: sheetChangesetSummary(record, owner), results: [], text });
}

// The sheet now, with the cells the revert compares and writes, and every cell when it deletes rows or columns.
async function currentSheet(
  ctx: DocumentRouteContext,
  record: SheetChangesetRecord,
  inverse: readonly SheetWrite[],
  after: SheetChangesetAfter,
) {
  const head = await readSheetHead(ctx.env, record.documentId, record.sheetId);
  if (!head) return null;
  if (inverse.some(deletes)) {
    const whole = await listSheets(ctx.env, record.documentId, { ids: [record.sheetId] });
    return { ...head, cells: cellsFromJson(whole[0]?.cells ?? []) };
  }
  const keys = new Set(Object.keys(after.cells));
  for (const w of inverse)
    if (w.kind !== 'title') for (const ch of w.cells ?? []) keys.add(`${ch.r}:${ch.c}`);
  return {
    ...head,
    cells: cellsFromJson(await readCells(ctx.env, record.documentId, record.sheetId, [...keys])),
  };
}

export async function revertSheetChangeset(
  ctx: DocumentRouteContext,
  document: DocumentDTO,
  record: SheetChangesetRecord,
  owner: string,
): Promise<Response> {
  if (!(await gateEdit(ctx, document.id, document.ownerId, document.teamId, record.tabId)))
    return forbidden();
  const parts = await getSheetChangesetParts(ctx.env, record.id);
  if (!parts.inverse || !parts.after) return notFound();
  const inverse = JSON.parse(parts.inverse) as SheetWrite[];
  const after = JSON.parse(parts.after) as SheetChangesetAfter;
  const current = await currentSheet(ctx, record, inverse, after);
  if (!current) return notFound();
  const plan = planSheetRevert(current, inverse, after);
  const where = { documentId: document.id, sheetId: record.sheetId, id: record.id };
  if (plan.writes.length === 0) {
    sheetChangesetLog('nothing', { ...where, kept: plan.kept.length });
    const body: SheetRevertResponse = {
      changeset: null,
      reverted: 0,
      kept: keptOf(plan.kept),
      lint: null,
    };
    return json(body);
  }
  const [by, author] = await Promise.all([writer(ctx, owner), authorOf(ctx, owner)]);
  const who = () =>
    protectionCallerOf(
      ctx,
      { documentId: document.id, ownerId: document.ownerId, teamId: document.teamId },
      owner,
    );
  const scope = await tabScopeOf(ctx, document);
  const result = await storeSheetChangeset({
    ctx,
    documentId: document.id,
    sheetId: record.sheetId,
    writes: plan.writes,
    summary: null,
    rev: null,
    strict: false,
    by,
    author,
    tokenId: ctx.token?.id ?? null,
    scopeTab: scope ?? null,
    frontDoor: frontDoorOf(ctx.request),
    revertOf: record.id,
    caller: who,
  });
  refreshAfterWrite(ctx, document, record.tabId, author, result);
  if (result.status !== 200) return respond(result);
  const written = (result.body as { changeset: SheetRevertResponse['changeset'] }).changeset;
  const reverted = written
    ? written.counts.added + written.counts.changed + written.counts.removed
    : 0;
  const body: SheetRevertResponse = {
    changeset: written,
    reverted,
    kept: keptOf(plan.kept),
    lint: null,
  };
  return json(body);
}
