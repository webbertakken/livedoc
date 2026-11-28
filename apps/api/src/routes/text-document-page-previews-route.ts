// GET /api/documents/:id/tabs/:tabId/page-previews (docs/specs/034-text-documents/agents-and-sync.md "Page
// previews"): a text document's pages, laid out by the editor's arithmetic over lines broken from the bundled faces'
// widths, each page asked as SVG and labelled approximate. Read-gated as the tab's views are: a tab-scoped link on its
// own tab only, a Viewer through their copy.
import {
  TEXT_DOCUMENT_PAGE_PREVIEWS_SEGMENT,
  type TextDocumentPagePreviewsResponse,
} from '@livedoc/api-schema';
import { documentTabOf, NO_SUCH_DOCUMENT_TAB } from '@livedoc/document-views';
import { pagePreviews, TEXT_PREVIEW_PAGES_MAX } from '@livedoc/text-documents';
import { getDocumentMeta } from '../db';
import { json } from '../responses';
import { isTabInScope } from '../tab-scope';
import {
  deniedOnTab,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';
import { grantedTab } from './granted-tab';
import { readTextDocumentModel } from './text-document-views-route';

const refused = (
  status: number,
  error: string,
  message: string,
  where: Record<string, unknown>,
) => {
  console.info('[page-previews] refused', { error, ...where });
  return json({ error, message }, { status });
};

/** `pages`: one page number or a range `a..b` of at most TEXT_PREVIEW_PAGES_MAX pages; 1 by default. */
export function parsePages(raw: string | null): { from: number; to: number } | string {
  if (raw === null) return { from: 1, to: 1 };
  const [a, b, ...rest] = raw.trim().split('..');
  const from = Number(a);
  const to = b === undefined ? from : Number(b);
  if (rest.length > 0 || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    return 'pages takes a page number or a range, like 2 or 1..3';
  if (to - from + 1 > TEXT_PREVIEW_PAGES_MAX)
    return `pages takes at most ${TEXT_PREVIEW_PAGES_MAX} pages a call`;
  return { from, to };
}

export async function handleTextDocumentPagePreviews(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request } = ctx;
  if (
    segments.length !== 6 ||
    segments[3] !== 'tabs' ||
    segments[5] !== TEXT_DOCUMENT_PAGE_PREVIEWS_SEGMENT ||
    request.method !== 'GET'
  )
    return null;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const where = { doc: documentId, tab: tabId };
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(ctx.env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
  if (!grant || !(await isTabInScope(ctx.env, documentId, grant.tabScope, tabId)))
    return deniedOnTab(ctx, meta);
  const tab = await grantedTab(ctx, meta, tabId, owner);
  if (!tab) return refused(404, 'not_found', 'No such tab.', where);
  if (tab.kind !== 'text-document')
    return refused(400, 'not_a_text_document', 'Page previews draw a text document tab.', where);
  const pages = parsePages(ctx.url.searchParams.get('pages'));
  if (typeof pages === 'string') return refused(400, 'invalid_value', pages, where);
  const started = Date.now();
  let read: Awaited<ReturnType<typeof readTextDocumentModel>>;
  try {
    read = await readTextDocumentModel(ctx.env, documentId, tabId, grant.role === 'view');
  } catch (error) {
    console.warn('[page-previews] unreadable', { ...where, error: String(error) });
    return json({ error: 'text_document_unreadable' }, { status: 503 });
  }
  if (!read) {
    console.warn('[page-previews] unreadable', { ...where, viewer: grant.role === 'view' });
    return json({ error: 'text_document_unreadable' }, { status: 503 });
  }
  const documentTab = documentTabOf(read.document, ctx.url.searchParams.get('only') ?? undefined);
  if (!documentTab) return refused(400, 'invalid_value', NO_SUCH_DOCUMENT_TAB, where);
  const drawn = pagePreviews(read.document, documentTab.body, pages);
  if (!drawn.ok)
    return refused(drawn.code === 'page_not_found' ? 404 : 413, drawn.code, drawn.message, where);
  console.info('[page-previews] drawn', {
    ...where,
    pages: `${pages.from}..${pages.to}`,
    pageCount: drawn.pageCount,
    bytes: drawn.pages.reduce((n, p) => n + p.svg.length, 0),
    ms: Date.now() - started,
    agent: ctx.token !== null,
  });
  const body: TextDocumentPagePreviewsResponse = {
    pages: drawn.pages.map((p) => ({ ...p })),
    pageCount: drawn.pageCount,
    approximate: true,
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}
