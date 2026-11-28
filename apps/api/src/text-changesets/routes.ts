// A text document's changesets over REST (docs/specs/024-agents/agent-changesets.md "A text document's changesets"):
//   POST /api/documents/<id>/tabs/<tabId>/changesets     submit (`?dryRun=1` answers the result lines, writes nothing)
//   GET  /api/documents/<id>/changesets/<tc_…>           one, with its result lines (through routes/changesets.ts)
//   POST /api/documents/<id>/changesets/<tc_…>/revert    its undo step undone, as a new changeset
// The engine applies the operations to the state as it stands; the room stores and relays the update as an editor's.
import {
  type ChangesetCounts,
  type ChangesetSummary,
  type TextChangesetError,
  type TextChangesetResponse,
  type TextChangesetWritten,
  type TextRevertResponse,
} from '@livedoc/api-schema';
import {
  applyTextChangeset,
  base64OfBytes,
  bytesOfBase64,
  revertTextChangeset,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
  UndoSteps,
  type TextOpLine,
} from '@livedoc/text-documents';
import { adderKeyFor } from '../adder-key';
import { afterChangeset } from '../changesets/after';
import { mintTextChangesetId } from '../changesets/changeset-id';
import { frontDoorOf } from '../changesets/front-door';
import type { Author } from '../changesets/write';
import {
  getTextChangesetParts,
  insertTextChangeset,
  type TextChangesetRecord,
} from '../db/text-changesets';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { forbidden, json, notFound } from '../responses';
import { postLiveTabUpdate } from '../room-client';
import { authorOf } from '../routes/changesets';
import {
  deniedParticipate,
  gateEdit,
  gateParticipate,
  gateRead,
  type DocumentRouteContext,
} from '../routes/context';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { storedTextDocumentTab } from '../text-documents/text-document-store';
import type { DocumentDTO } from '../types';
import { parseTextChangeset } from './request';

export type TextChangesetResult = { status: number; body: unknown };

const STATUS: Readonly<Record<TextChangesetError, number>> = {
  invalid_operation: 400,
  not_a_text_document: 400,
  text_not_found: 422,
  text_ambiguous: 422,
  ref_not_found: 422,
  stale_tab: 412,
  document_too_large: 413,
  forbidden_operation: 403,
};

export function textChangesetLog(
  event: 'applied' | 'refused' | 'reverted' | 'nothing' | 'dry-run' | 'unrecorded',
  fields: Record<string, unknown>,
): void {
  (event === 'refused' || event === 'unrecorded' ? console.warn : console.info)(
    `[text-changeset] ${event}`,
    fields,
  );
}

/** What a Participant may run: comments and suggestions. */
const participantMay = (line: TextOpLine): boolean => line.suggest || line.op.op === 'comment';

const ADDED = /^(?:inserted|appended|prepended|replaced) ¶(\d+)(?:\.\.¶(\d+))?$/;

/** A text changeset's counts: paragraphs it added, and its other operations. */
export function countsOf(results: readonly string[]): ChangesetCounts {
  let added = 0;
  let changed = 0;
  for (const line of results) {
    const match = ADDED.exec(line);
    if (!match) changed += 1;
    else added += Number(match[2] ?? match[1]) - Number(match[1]) + 1;
  }
  return { added, changed, removed: 0 };
}

const respond = (r: TextChangesetResult) => json(r.body, { status: r.status });

/** Sends the update to the room as the caller's; null when stored, else the refusal to answer. */
async function post(
  ctx: DocumentRouteContext,
  where: { documentId: string; tabId: string },
  update: Uint8Array,
  sent: { edits: boolean; adderKey: string },
): Promise<TextChangesetResult | null> {
  if (update.byteLength > TEXT_DOCUMENT_UPDATE_MAX_BYTES)
    return {
      status: 413,
      body: {
        error: 'document_too_large',
        line: 0,
        operation: 0,
        message: `the change is ${update.byteLength} bytes; one change holds at most ${TEXT_DOCUMENT_UPDATE_MAX_BYTES}`,
      },
    };
  const { status, limit } = await postLiveTabUpdate(
    ctx.env,
    TEXT_DOCUMENT_LIVE_TAB,
    where.documentId,
    where.tabId,
    update,
    { level: sent.edits ? 'edit' : 'participate', adderKey: sent.adderKey },
  );
  if (status === 204) return null;
  textChangesetLog('refused', { ...where, room: status, limit });
  if (status === 413)
    return {
      status: 413,
      body: {
        error: 'document_too_large',
        line: 0,
        operation: 0,
        message: `the document would pass its ${limit ?? 'size'} limit`,
      },
    };
  if (status === 403)
    return {
      status: 403,
      body: {
        error: 'forbidden_operation',
        line: 0,
        operation: 0,
        message: 'the room refused a change that is not the caller’s',
      },
    };
  if (status === 404) return { status: 404, body: { error: 'not_found' } };
  return { status: 503, body: { error: 'room_unavailable' } };
}

type RecordInput = Omit<TextChangesetRecord, 'counts' | 'revertedBy'> & {
  results: readonly string[];
};

async function record(
  ctx: DocumentRouteContext,
  r: RecordInput,
  parts: { ops: string; step: Uint8Array; threads: readonly string[] },
): Promise<TextChangesetWritten> {
  const counts = countsOf(r.results);
  const written: TextChangesetWritten = {
    id: r.id,
    tabId: r.tabId,
    documentTab: r.documentTab,
    counts,
  };
  try {
    await insertTextChangeset(
      ctx.env,
      { ...r, counts, revertedBy: null },
      {
        ops: parts.ops,
        results: JSON.stringify(r.results),
        step: base64OfBytes(parts.step),
        threads: JSON.stringify(parts.threads),
      },
    );
  } catch (error) {
    // The update is stored and relayed: the writing stands, unrecorded, and the log says so.
    textChangesetLog('unrecorded', {
      documentId: r.documentId,
      tabId: r.tabId,
      id: r.id,
      error: String(error),
    });
  }
  return written;
}

export async function submitTextChangeset(
  ctx: DocumentRouteContext,
  document: DocumentDTO,
  tabId: string,
  owner: string,
  raw: unknown,
): Promise<TextChangesetResult> {
  const started = Date.now();
  const where = { documentId: document.id, tabId };
  if (!(await gateParticipate(ctx, document.id, document.ownerId, document.teamId, tabId))) {
    const denied = await deniedParticipate(ctx, document, tabId);
    return { status: denied.status, body: await denied.json() };
  }
  const parsed = parseTextChangeset(raw);
  if (!parsed.ok) {
    textChangesetLog('refused', { ...where, ...parsed.refused.body });
    return parsed.refused;
  }
  const { ops, documentTab, summary, base } = parsed.value;
  // The engine reads the state as it stands; the tab's row names its format.
  const edits = await gateEdit(ctx, document.id, document.ownerId, document.teamId, tabId);
  const barred = edits ? undefined : ops.find((line) => !participantMay(line));
  if (barred) {
    textChangesetLog('refused', { ...where, error: 'forbidden_operation', line: barred.line });
    return {
      status: 403,
      body: {
        error: 'forbidden_operation',
        line: barred.line,
        operation: barred.operation,
        message: `a Participant comments and suggests; ${barred.op.op} needs an Editor`,
      },
    };
  }
  const [author, adderKey, state] = await Promise.all([
    authorOf(ctx, owner),
    adderKeyFor(document.id, owner),
    readLiveTabState(ctx.env, TEXT_DOCUMENT_LIVE_TAB, tabId),
  ]);
  const stored = await storedTextDocumentTab(ctx.env, document.id, tabId);
  if (!stored) return { status: 404, body: { error: 'not_found' } };
  const applied = applyTextChangeset({
    state: [state],
    format: stored.format,
    ...(documentTab !== undefined ? { documentTab } : {}),
    ops,
    author: { key: adderKey, name: author.name, colour: author.color },
    ...(base ? { base } : {}),
    now: started,
    newId: () => crypto.randomUUID(),
  });
  if (!applied.ok) {
    const { ok: _, ...refusal } = applied;
    textChangesetLog('refused', { ...where, error: refusal.error, line: refusal.line });
    return { status: STATUS[refusal.error], body: refusal };
  }
  const answer = (changeset: TextChangesetWritten | null, dryRun = false): TextChangesetResult => {
    const body: TextChangesetResponse = {
      dryRun,
      changeset,
      results: [...applied.results],
      text: applied.results.join('\n'),
    };
    return { status: 200, body };
  };
  const fields = { ...where, documentTab: applied.documentTab, ops: ops.length };
  if (ctx.url.searchParams.get('dryRun') === '1') {
    textChangesetLog('dry-run', { ...fields, ms: Date.now() - started });
    return answer(null, true);
  }
  if (!applied.update || UndoSteps.isEmpty(applied.step)) {
    textChangesetLog('nothing', fields);
    return answer(null);
  }
  const refused = await post(ctx, where, applied.update, { edits, adderKey });
  if (refused) return refused;
  const written = await record(
    ctx,
    {
      id: mintTextChangesetId(),
      documentId: document.id,
      tabId,
      documentTab: applied.documentTab,
      authorId: author.id,
      authorName: author.name,
      authorColor: author.color,
      tokenId: ctx.token?.id ?? null,
      summary,
      revertOf: null,
      createdAt: started,
      results: applied.results,
    },
    {
      ops: parsed.value.text,
      step: UndoSteps.encode(applied.step),
      threads: applied.threads,
    },
  );
  textChangesetLog('applied', {
    ...fields,
    id: written.id,
    bytes: applied.update.byteLength,
    ms: Date.now() - started,
  });
  if (ctx.token)
    ctx.waitUntil?.(afterChangeset.telemetry(ctx.env, 'Applied', frontDoorOf(ctx.request)));
  return answer(written);
}

export function textChangesetSummary(
  record: TextChangesetRecord,
  viewer: string,
): ChangesetSummary {
  return {
    id: record.id,
    tabId: record.tabId,
    documentTab: record.documentTab,
    rev: 0,
    author: { name: record.authorName, color: record.authorColor },
    agent: record.tokenId !== null,
    ...(record.tokenId !== null && record.authorId === viewer ? { tokenId: record.tokenId } : {}),
    summary: record.summary,
    counts: record.counts,
    revertOf: record.revertOf,
    createdAt: record.createdAt,
  };
}

export async function showTextChangeset(
  ctx: DocumentRouteContext,
  document: DocumentDTO,
  record: TextChangesetRecord,
  owner: string,
): Promise<Response> {
  if (!(await gateRead(ctx, document.id, document.ownerId, document.teamId, record.tabId)))
    return notFound();
  const parts = await getTextChangesetParts(ctx.env, record.id);
  const results = parts.results ? (JSON.parse(parts.results) as string[]) : [];
  return json({
    changeset: textChangesetSummary(record, owner),
    results,
    text: results.join('\n'),
  });
}

export async function revertTextChangesetRoute(
  ctx: DocumentRouteContext,
  document: DocumentDTO,
  record: TextChangesetRecord,
  owner: string,
): Promise<Response> {
  if (!(await gateEdit(ctx, document.id, document.ownerId, document.teamId, record.tabId)))
    return forbidden();
  const where = { documentId: document.id, tabId: record.tabId, id: record.id };
  const nothing = (why: string) => {
    textChangesetLog('nothing', { ...where, why });
    const body: TextRevertResponse = { changeset: null };
    return json(body);
  };
  if (record.revertedBy) return nothing(`reverted by ${record.revertedBy}`);
  const parts = await getTextChangesetParts(ctx.env, record.id);
  const step = parts.step ? bytesOfBase64(parts.step) : null;
  if (!step) return notFound();
  const threads = parts.threads ? (JSON.parse(parts.threads) as string[]) : [];
  const state = await readLiveTabState(ctx.env, TEXT_DOCUMENT_LIVE_TAB, record.tabId);
  const update = revertTextChangeset([state], step, threads);
  if (!update) return nothing('no change');
  const [author, adderKey]: [Author, string] = await Promise.all([
    authorOf(ctx, owner),
    adderKeyFor(document.id, owner),
  ]);
  const refused = await post(ctx, { documentId: document.id, tabId: record.tabId }, update, {
    edits: true,
    adderKey,
  });
  if (refused) return respond(refused);
  const written = await recordRevert(ctx, record, author, update);
  textChangesetLog('reverted', { ...where, by: written.id, bytes: update.byteLength });
  if (ctx.token)
    ctx.waitUntil?.(afterChangeset.telemetry(ctx.env, 'Reverted', frontDoorOf(ctx.request)));
  const body: TextRevertResponse = { changeset: written };
  return json(body);
}

/** A revert's own record: undoable in turn by its own step, which a revert of it reads from the state. */
function recordRevert(
  ctx: DocumentRouteContext,
  reverted: TextChangesetRecord,
  author: Author,
  update: Uint8Array,
): Promise<TextChangesetWritten> {
  const step = UndoSteps.ofUpdate(update);
  return record(
    ctx,
    {
      id: mintTextChangesetId(),
      documentId: reverted.documentId,
      tabId: reverted.tabId,
      documentTab: reverted.documentTab,
      authorId: author.id,
      authorName: author.name,
      authorColor: author.color,
      tokenId: ctx.token?.id ?? null,
      summary: null,
      revertOf: reverted.id,
      createdAt: Date.now(),
      results: [`reverted ${reverted.id}`],
    },
    { ops: 'revert', step: UndoSteps.encode(step), threads: [] },
  );
}
