// PUT /api/documents/<id>/tabs/<tabId>/name: a tab rename on its own
// (docs/specs/024-agents/agent-changesets.md "Whole-tab saves and tab renames"), for the CLI, the
// MCP and any script, which never do whole-tab saves. Advances the tab's revision and is relayed to
// the room as the same tab-meta an editor's own rename sends (CS42).

import { getDocument, listSheetHeads, renameTab } from '../db';
import { capStoredName } from '../names';
import { forbidden, json, notFound } from '../responses';
import { relayTabRename } from '../room-client';
import { structureRefusal } from '../tab-structure';
import { writer } from './item-route-kit';
import { storeSheetWrite } from './sheet-write-route';
import {
  gateEdit,
  missingDocument,
  requireOwner,
  tabScopeOf,
  type DocumentRouteContext,
} from './context';

export async function handleTabRename(
  ctx: DocumentRouteContext,
  id: string,
  tabId: string,
): Promise<Response> {
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const existing = await getDocument(ctx.env, id);
  if (!existing) return missingDocument(ctx, id);
  if (!(await gateEdit(ctx, id, existing.ownerId, existing.teamId, tabId))) return forbidden();
  // A tab's name is structure (docs/specs/013-workspace/tab-scoped-share-links.md "Structure"): a link to one tab
  // edits its content, never its name.
  if ((await tabScopeOf(ctx, existing)) !== null) {
    const refused = structureRefusal('name', { documentId: id, tabId });
    return json(refused.body, { status: refused.status });
  }
  const summary = existing.tabs.find((t) => t.id === tabId);
  if (!summary) return notFound();
  const body = (await ctx.request.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== 'string' || body.name.trim() === '') {
    return json(
      { error: 'invalid_name', message: 'name must be a non-empty string' },
      { status: 400 },
    );
  }
  // A spreadsheet's sheet tab is named as its sheet (docs/specs/029-sheets/spreadsheet.md "The workbook shape"): the
  // rename is its sheet's, by the sheet name's rules, which renames the tab with it.
  if (existing.workbook) return renameSheetTab(ctx, id, summary, body.name, owner);
  const name = capStoredName(body.name, summary.name, 'tab');
  const rev = await renameTab(ctx.env, tabId, name);
  if (rev === null) return notFound();
  console.info('[changeset] tab-renamed', { documentId: id, tabId, rev });
  // Awaited, bounded by ROOM_RELAY_TIMEOUT_MS; a room that misses it is logged and never fails the rename.
  await relayTabRename(ctx.env, id, tabId, name);
  return json({ tab: { ...summary, name } });
}

async function renameSheetTab(
  ctx: DocumentRouteContext,
  id: string,
  summary: { id: string },
  name: string,
  owner: string,
): Promise<Response> {
  const tabId = summary.id;
  const [sheet] = await listSheetHeads(ctx.env, id, tabId);
  if (!sheet) return notFound();
  const by = await writer(ctx, owner);
  const res = await storeSheetWrite(
    ctx,
    id,
    sheet.id,
    { write: { kind: 'title', title: name } },
    by,
    null,
  );
  if (!res.ok) return res;
  const title = name.trim();
  console.info('[changeset] tab-renamed', { documentId: id, tabId, sheet: sheet.id });
  return json({ tab: { ...summary, name: title } });
}
