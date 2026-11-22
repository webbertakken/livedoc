// A browser's thumbnail of a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail"):
//   GET /api/documents/<id>/pdf-documents/<tabId>/thumbnail  { wanted }: whether this caller should send one
//   PUT /api/documents/<id>/pdf-documents/<tabId>/thumbnail  the first page as a JPEG
// The question is read as the tab is; only an Editor is ever wanted, and only an Editor may send: a picture is
// whatever its sender says it is, and it is shown wherever the document is listed.
import { PDF_THUMBNAIL_MAX_BYTES } from '@livedoc/pdf-documents';
import { parseStoredLevel } from '@livedoc/api-schema';
import { getDocumentThumbMeta } from '../db';
import {
  checkPdfThumbnail,
  isFirstTab,
  pdfThumbnailWanted,
  storePdfBrowserThumbnail,
  type PdfThumbnailRefusal,
} from '../pdf-documents/pdf-browser-thumbnail';
import { storedPdfTab } from '../pdf-documents/pdf-document-store';
import { CORS_HEADERS, forbidden, imagesUnavailable, json } from '../responses';
import {
  deniedOnTab,
  gateEdit,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

const notPdf = () => json({ error: 'pdf_not_found' }, { status: 404 });

export async function handlePdfThumbnailRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  if (ctx.request.method === 'GET') return readWanted(ctx);
  if (ctx.request.method === 'PUT') return putThumbnail(ctx);
  return null;
}

async function readWanted(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentThumbMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
  if (!grant || (grant.tabScope !== null && grant.tabScope !== tabId))
    return deniedOnTab(ctx, meta);
  if (!(await storedPdfTab(env, documentId, tabId))) return notPdf();
  const wanted =
    (await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId)) &&
    (await pdfThumbnailWanted(env, documentId, tabId, meta.savedAt));
  return json({ wanted }, { headers: { 'Cache-Control': 'no-store' } });
}

async function putThumbnail(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, request, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const where = `document=${documentId} tab=${tabId}`;
  const refused = (
    name: PdfThumbnailRefusal | 'thumbnail_not_wanted' | 'level_too_low',
    status: number,
  ) => {
    console.warn(`[pdf] browser-upload-refused ${where} name=${name}`);
    return name === 'level_too_low' ? forbidden(name) : json({ error: name }, { status });
  };
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentThumbMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId))) {
    // A grant confined to another tab sees no such tab; a caller with no grant is told nothing more than refused.
    const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
    if (!grant) return forbidden();
    if (grant.tabScope !== null && grant.tabScope !== tabId) return notPdf();
    console.warn(`[pdf] mode-refused ${where} op=thumbnail level=${parseStoredLevel(grant.role)}`);
    return refused('level_too_low', 403);
  }
  if (!(await storedPdfTab(env, documentId, tabId))) return notPdf();
  if (!env.IMAGES) return imagesUnavailable();
  if (!(await isFirstTab(env, documentId, tabId))) return refused('thumbnail_not_wanted', 409);
  // Refused by what it says of itself before a byte is read, then by what it is.
  if (Number(request.headers.get('Content-Length')) > PDF_THUMBNAIL_MAX_BYTES)
    return refused('thumbnail_too_large', 413);
  const checked = checkPdfThumbnail(new Uint8Array(await request.arrayBuffer()));
  if (!checked.ok) return refused(checked.name, checked.name === 'thumbnail_too_large' ? 413 : 400);
  await storePdfBrowserThumbnail(
    env,
    env.IMAGES,
    { documentId, tabId },
    checked.jpeg,
    meta.savedAt,
  );
  console.info(
    `[pdf] browser-upload what=thumbnail ${where} bytes=${checked.jpeg.byteLength} savedAt=${meta.savedAt}`,
  );
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
