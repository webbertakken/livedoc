// GET /api/documents/:id/tabs/:tabId/render.svg (docs/specs/015-api/api.md): one tab drawn by the shared renderer,
// read-gated like the tab itself. The CLI's `pull --svg` and `tab render` read it, so every front door draws alike.
// A spreadsheet's sheet tab draws its sheet and charts, all of them or `range` (docs/specs/029-sheets/sheet-store.md
// "Agents in a spreadsheet", Previews).

import { parseRangeText } from '@livedoc/sheets';
import { getDocumentMeta } from '../db';
import { json, notFound, svgImage } from '../responses';
import { renderSpreadsheetTabSvg } from '../spreadsheet-image';
import { renderTabSvg } from '../thumbnail';
import {
  deniedOnTab,
  gateRead,
  missingDocument,
  tabScopeOf,
  type DocumentRouteContext,
} from './context';

// A drawing changes with every edit; it is never cached.
const NO_STORE = 'no-store';

const badRange = (message: string) => {
  console.info('[render] range refused', { message });
  return json({ error: 'invalid_value', message }, { status: 400 });
};

export async function handleTabRender(ctx: DocumentRouteContext): Promise<Response | null> {
  const { segments, request } = ctx;
  if (segments.length !== 6 || segments[3] !== 'tabs' || segments[5] !== 'render.svg') return null;
  if (request.method !== 'GET') return null;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const doc = await getDocumentMeta(ctx.env, documentId);
  if (!doc) return missingDocument(ctx, documentId);
  if (!(await gateRead(ctx, documentId, doc.ownerId, doc.teamId, tabId)))
    return deniedOnTab(ctx, doc);
  const asked = ctx.url.searchParams.get('range');
  const range = asked === null ? undefined : parseRangeText(asked);
  if (range === null) return badRange('range takes an A1 cell or range');
  const sheet = await renderSpreadsheetTabSvg(ctx.env, documentId, tabId, {
    ...(range ? { range } : {}),
    scope: await tabScopeOf(ctx, doc),
  });
  if (sheet === null && range) return badRange('range takes a spreadsheet’s sheet tab');
  const svg = sheet ?? (await renderTabSvg(ctx.env, documentId, tabId));
  if (svg === null) return notFound();
  console.info('[render] tab', {
    documentId,
    tabId,
    bytes: svg.length,
    agent: ctx.token !== null,
    spreadsheet: sheet !== null,
    range: range !== undefined,
  });
  return svgImage(svg, NO_STORE);
}
