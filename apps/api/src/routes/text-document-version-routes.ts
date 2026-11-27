// A text document's versions (docs/specs/034-text-documents/live-editing-and-storage.md "The api"):
//   GET   /api/documents/<id>/text-documents/<tabId>/versions                     the list, newest first
//   POST  /api/documents/<id>/text-documents/<tabId>/versions                     name the current version
//   GET   /api/documents/<id>/text-documents/<tabId>/versions/<versionId>         one, read whole, with the one before
//   PUT   /api/documents/<id>/text-documents/<tabId>/versions/<versionId>         name, rename or unname it
//   POST  /api/documents/<id>/text-documents/<tabId>/versions/<versionId>         restore it
// Every route is an edit of the tab (Editors only, as Google's version history). The writes run on the room's queue.
import {
  parseVersionAuthorLabel,
  parseVersionName,
  type TextDocumentVersionListDto,
} from '@livedoc/api-schema';
import { TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS } from '@livedoc/text-documents';
import { adderKeyFor } from '../adder-key';
import { getDocumentMeta } from '../db/documents';
import { json } from '../responses';
import { writeTextDocumentVersion } from '../room-client';
import { TextDocumentAuthors } from '../text-documents/text-document-authors';
import { storedTextDocumentTab } from '../text-documents/text-document-store';
import { versionDto, versionRead, versionRows } from '../text-documents/text-document-version-rows';
import type { TextDocumentVersionWriteRequest } from '../text-documents/text-document-version-write';
import {
  deniedEdit,
  gateEdit,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

const notTextDocument = () => json({ error: 'text_document_not_found' }, { status: 404 });
const notFound = () => json({ error: 'version_not_found' }, { status: 404 });

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleTextDocumentVersionRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request, env } = ctx;
  if (segments.length < 6 || segments.length > 7) return null;
  if (segments[3] !== 'text-documents' || segments[5] !== 'versions') return null;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const versionId = segments[6] ?? null;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId)))
    return deniedEdit(ctx, meta, tabId);
  if (!(await storedTextDocumentTab(env, documentId, tabId))) return notTextDocument();

  if (request.method === 'GET' && segments.length === 6) {
    const rows = await versionRows(env, tabId);
    const lastEdit = await new TextDocumentAuthors(env, Date.now).lastEdit(tabId);
    const list: TextDocumentVersionListDto = { versions: rows.reverse().map(versionDto), lastEdit };
    return json(list);
  }
  if (request.method === 'GET' && segments.length === 7) {
    const clients = await new TextDocumentAuthors(env, Date.now).clients(tabId);
    const read = versionRead(await versionRows(env, tabId), versionId!, clients);
    return read ? json(read) : notFound();
  }

  const body = await bodyOf(request);
  const label = parseVersionAuthorLabel((body as { author?: unknown } | null)?.author);
  const by = { key: await adderKeyFor(documentId, owner), ...label };
  const place = { documentId, tabId };
  let write: TextDocumentVersionWriteRequest;
  if (request.method === 'POST' && segments.length === 7)
    write = { ...place, action: 'restore', versionId: versionId!, by };
  else if (
    (request.method === 'POST' && segments.length === 6) ||
    (request.method === 'PUT' && segments.length === 7)
  ) {
    const name = parseVersionName(body, TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS);
    if (!name.ok) return json({ error: name.error }, { status: 400 });
    // Naming the current version needs a name; only a version's own row unnames it.
    if (segments.length === 6 && name.name === null)
      return json({ error: 'version_name_invalid' }, { status: 400 });
    write =
      segments.length === 6
        ? { ...place, action: 'name-current', name: name.name, by }
        : { ...place, action: 'name', versionId: versionId!, name: name.name, by };
  } else return null;
  const answer = await writeTextDocumentVersion(env, write);
  if (answer.status === 503) return json({ error: 'room_unavailable' }, { status: 503 });
  return json(answer.body, { status: answer.status });
}
