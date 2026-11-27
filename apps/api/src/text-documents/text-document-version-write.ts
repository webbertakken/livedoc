// A write to a text document's versions as the api asks its room for it (docs/specs/034-text-documents/
// live-editing-and-storage.md "The api"): name one, name the current one, or restore one. The route has gated it as an
// edit of the tab and made the sender's key; the room runs it on its write queue.
import type { VersionAuthor } from './text-document-authors';
import type { RoomTextDocumentVersions, VersionWrite } from './room-text-document-versions';

type Place = { readonly documentId: string; readonly tabId: string };

export type TextDocumentVersionWriteRequest =
  | (Place & {
      readonly action: 'name';
      readonly versionId: string;
      readonly name: string | null;
      readonly by: VersionAuthor;
    })
  | (Place & {
      readonly action: 'name-current';
      readonly name: string | null;
      readonly by: VersionAuthor;
    })
  | (Place & {
      readonly action: 'restore';
      readonly versionId: string;
      readonly by: VersionAuthor;
    });

const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const orNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === 'string' ? v : undefined;

function authorOf(v: unknown): VersionAuthor | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const key = orNull(o.key);
  const name = orNull(o.name);
  const color = orNull(o.color);
  if (key === undefined || name === undefined || color === undefined) return null;
  return { key, name, color };
}

/** The write a body asks for, or null when it is malformed. */
export function parseTextDocumentVersionWrite(
  body: unknown,
): TextDocumentVersionWriteRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const o = body as Record<string, unknown>;
  const by = authorOf(o.by);
  if (!text(o.documentId) || !text(o.tabId) || !by) return null;
  const place = { documentId: o.documentId, tabId: o.tabId };
  const name = orNull(o.name);
  if (o.action === 'name' && text(o.versionId) && name !== undefined)
    return { ...place, action: 'name', versionId: o.versionId, name, by };
  if (o.action === 'name-current' && name !== undefined)
    return { ...place, action: 'name-current', name, by };
  if (o.action === 'restore' && text(o.versionId))
    return { ...place, action: 'restore', versionId: o.versionId, by };
  return null;
}

/** Runs the write on the room's keeper. */
export function applyTextDocumentVersionWrite(
  versions: RoomTextDocumentVersions,
  write: TextDocumentVersionWriteRequest,
): Promise<VersionWrite> {
  const place = { documentId: write.documentId, tabId: write.tabId };
  switch (write.action) {
    case 'name':
      return versions.name(place, write.versionId, write.name, write.by);
    case 'name-current':
      return versions.nameCurrent(place, write.name, write.by);
    case 'restore':
      return versions.restore(place, write.versionId, write.by);
  }
}
