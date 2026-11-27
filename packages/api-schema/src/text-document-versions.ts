// A text document's versions on the wire (docs/specs/034-text-documents/live-editing-and-storage.md "The api"): the
// list, one version read whole with the one before it, and the bodies that name or restore one.

/** Who wrote: their adder key on the document (null: unrecorded), with the name and colour they wrote under. */
export type VersionEditorDto = {
  key: string | null;
  name: string | null;
  color: string | null;
};

export type TextDocumentVersionDto = {
  id: string;
  kind: 'automatic' | 'named';
  name: string | null;
  takenAt: number;
  /** The namer or restorer; null for an automatic version. */
  takenBy: VersionEditorDto | null;
  /** The version a restore brought back, for one taken after a restore. */
  restoredFrom: string | null;
  editors: VersionEditorDto[];
};

/** What a name or restore answers: the version as it now stands. */
export type TextDocumentVersionWriteDto = { version: TextDocumentVersionDto };

/** When the tab's newest update was stored, and who sent it (an unrecorded sender: key, name and colour null). */
export type TextDocumentLastEditDto = { at: number; editor: VersionEditorDto };

/** The versions, newest first, and the tab's last edit (null before any). */
export type TextDocumentVersionListDto = {
  versions: TextDocumentVersionDto[];
  lastEdit: TextDocumentLastEditDto | null;
};

/** One version, its snapshot and the one before it (Yjs snapshots, base64), and who wrote what in it. */
export type TextDocumentVersionReadDto = {
  version: TextDocumentVersionDto;
  snapshot: string;
  previous: string;
  /** Each Yjs client id's author. */
  clients: Record<string, VersionEditorDto>;
  /** The deletions each editor made in it, by key (a Yjs snapshot holding them, base64). */
  deletedBy: Record<string, string>;
};

/** The body that names a version or the current one; `author` labels the person, never says whose they are. */
export type TextDocumentVersionNameBody = {
  name: string;
  author?: { name?: string; color?: string };
};

export type TextDocumentVersionError =
  'version_name_too_long' | 'version_name_invalid' | 'named_versions_full' | 'version_not_found';

const LABEL_MAX = 64;
const COLOUR = /^#[0-9a-fA-F]{6}$/;

/** The label a body gives its sender: what is malformed is dropped, never refused. */
export function parseVersionAuthorLabel(author: unknown): {
  name: string | null;
  color: string | null;
} {
  const o =
    typeof author === 'object' && author !== null ? (author as Record<string, unknown>) : {};
  const name =
    typeof o.name === 'string' && o.name.trim().length > 0 && o.name.length <= LABEL_MAX
      ? o.name.trim()
      : null;
  const color = typeof o.color === 'string' && COLOUR.test(o.color) ? o.color : null;
  return { name, color };
}

/** A body's name, trimmed; an empty one is none. */
export function parseVersionName(
  body: unknown,
  maxChars: number,
): { ok: true; name: string | null } | { ok: false; error: TextDocumentVersionError } {
  const name =
    typeof body === 'object' && body !== null ? (body as { name?: unknown }).name : undefined;
  if (typeof name !== 'string') return { ok: false, error: 'version_name_invalid' };
  const trimmed = name.trim();
  if (trimmed.length > maxChars) return { ok: false, error: 'version_name_too_long' };
  return { ok: true, name: trimmed.length > 0 ? trimmed : null };
}
