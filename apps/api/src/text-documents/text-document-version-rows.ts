// A text document tab's versions as the room's rows hold them (docs/specs/034-text-documents/live-editing-and-storage.md
// "Versions"): read in order, written one at a time, and answered on the wire. A version reads whole as its state vector
// with its own deletions and every earlier kept version's.
import type {
  TextDocumentVersionDto,
  TextDocumentVersionReadDto,
  VersionEditorDto,
} from '@livedoc/api-schema';
import { base64OfBytes, VersionSnapshots } from '@livedoc/text-documents';
import { fromBlob, toBlob } from '../db/blob';
import type { DocumentEnv } from '../types';

export type VersionKind = 'automatic' | 'named';

export type VersionRow = {
  readonly tabId: string;
  readonly seq: number;
  readonly id: string;
  readonly kind: VersionKind;
  readonly name: string | null;
  readonly takenAt: number;
  readonly takenBy: VersionEditorDto | null;
  readonly restoredFrom: string | null;
  readonly stateVector: Uint8Array;
  readonly deletions: Uint8Array;
  readonly editors: readonly VersionEditorDto[];
  /** Each editor's deletions in it, by key, encoded. */
  readonly deletedBy: Readonly<Record<string, string>>;
  readonly bytes: number;
};

type Record_ = Record<string, unknown>;

const parsed = <T>(text: unknown, fallback: T): T => {
  try {
    return typeof text === 'string' ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

function rowOf(r: Record_): VersionRow {
  const takenBy =
    typeof r.taken_by === 'string'
      ? {
          key: r.taken_by,
          name: (r.taken_by_name as string | null) ?? null,
          color: (r.taken_by_color as string | null) ?? null,
        }
      : null;
  return {
    tabId: r.tab_id as string,
    seq: r.seq as number,
    id: r.id as string,
    kind: r.kind === 'named' ? 'named' : 'automatic',
    name: (r.name as string | null) ?? null,
    takenAt: r.taken_at as number,
    takenBy,
    restoredFrom: (r.restored_from as string | null) ?? null,
    stateVector: fromBlob(r.state_vector),
    deletions: fromBlob(r.deletions),
    editors: parsed<VersionEditorDto[]>(r.editors, []),
    deletedBy: parsed<Record<string, string>>(r.deleted_by, {}),
    bytes: r.bytes as number,
  };
}

/** The bytes a row holds: what thinning and the caps weigh. */
export function rowBytes(row: Omit<VersionRow, 'bytes'>): number {
  return (
    row.stateVector.byteLength +
    row.deletions.byteLength +
    JSON.stringify(row.editors).length +
    JSON.stringify(row.deletedBy).length
  );
}

/** Every version of the tab, oldest first. */
export async function versionRows(env: DocumentEnv, tabId: string): Promise<VersionRow[]> {
  const { results } = await env.DOCUMENT_DB.prepare(
    'SELECT * FROM text_document_versions WHERE tab_id = ? ORDER BY seq',
  )
    .bind(tabId)
    .all<Record_>();
  return (results ?? []).map(rowOf);
}

/** Writes the row as it stands: a new version, or one that thinning or naming changed. */
export function putVersionStatement(env: DocumentEnv, row: VersionRow): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    `INSERT INTO text_document_versions (tab_id, seq, id, kind, name, taken_at, taken_by, taken_by_name,
       taken_by_color, restored_from, state_vector, deletions, editors, deleted_by, bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tab_id, seq) DO UPDATE SET kind = excluded.kind, name = excluded.name,
       deletions = excluded.deletions, editors = excluded.editors, deleted_by = excluded.deleted_by,
       bytes = excluded.bytes`,
  ).bind(
    row.tabId,
    row.seq,
    row.id,
    row.kind,
    row.name,
    row.takenAt,
    row.takenBy?.key ?? null,
    row.takenBy?.name ?? null,
    row.takenBy?.color ?? null,
    row.restoredFrom,
    toBlob(row.stateVector),
    toBlob(row.deletions),
    JSON.stringify(row.editors),
    JSON.stringify(row.deletedBy),
    row.bytes,
  );
}

export function dropVersionStatement(
  env: DocumentEnv,
  tabId: string,
  id: string,
): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    'DELETE FROM text_document_versions WHERE tab_id = ? AND id = ?',
  ).bind(tabId, id);
}

/** The version as the wire lists it. */
export function versionDto(row: VersionRow): TextDocumentVersionDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    takenAt: row.takenAt,
    takenBy: row.takenBy,
    restoredFrom: row.restoredFrom,
    editors: [...row.editors],
  };
}

/** The version at `index` of the rows (oldest first) read whole, encoded; the empty snapshot before the first. */
export function snapshotAt(rows: readonly VersionRow[], index: number): Uint8Array {
  if (index < 0) return VersionSnapshots.encodedSnapshotOf(null, []);
  return VersionSnapshots.encodedSnapshotOf(
    rows[index]!.stateVector,
    rows.slice(0, index + 1).map((r) => r.deletions),
  );
}

/** One version read whole with the one before it and who wrote what; null when the tab has no such version. */
export function versionRead(
  rows: readonly VersionRow[],
  versionId: string,
  clients: ReadonlyMap<number, VersionEditorDto>,
): TextDocumentVersionReadDto | null {
  const index = rows.findIndex((r) => r.id === versionId);
  if (index < 0) return null;
  return {
    version: versionDto(rows[index]!),
    snapshot: base64OfBytes(snapshotAt(rows, index)),
    previous: base64OfBytes(snapshotAt(rows, index - 1)),
    clients: Object.fromEntries([...clients].map(([client, author]) => [String(client), author])),
    deletedBy: { ...rows[index]!.deletedBy },
  };
}
