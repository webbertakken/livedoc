// The content hash of a document's move into its room (docs/specs/006-document/document-storage-move.md "A move",
// docs/specs/006-document/document-storage-move.md). The same reads and
// the same hash run in three places: the room over D1 before it writes, the room over its own SQLite after, and the
// operator's tool over D1 through wrangler. So the tables, their columns and their order live here once.
//
// Only rows a move copies are hashed. Tab stats, image references, board statuses and holders are recomputed from
// the bodies, so they are not compared.

/** One copied table: every column in a fixed order, the columns it sorts by, and how it is found by document. */
export type MovableTable = {
  table: string;
  columns: readonly string[];
  sortBy: readonly string[];
  /** The rows of document `?1`; `HEAD` is `documents` in D1 and `document` in a room. */
  where: string;
};

const OWN_TABS = 'SELECT tab_id FROM document_tabs WHERE document_id = ?1';

export const MOVABLE_TABLES: readonly MovableTable[] = [
  {
    table: 'document',
    columns: ['presentation', 'item_types', 'item_types_rev', 'items_rev', 'items_next_key'],
    sortBy: [],
    where: 'id = ?1',
  },
  {
    table: 'tabs',
    columns: ['id', 'name', 'data', 'updated_at', 'element_count', 'rev'],
    sortBy: ['id'],
    where: `id IN (${OWN_TABS})`,
  },
  {
    table: 'document_tabs',
    columns: ['document_id', 'tab_id', 'order_index', 'added_at', 'folder'],
    sortBy: ['tab_id'],
    where: 'document_id = ?1',
  },
  {
    table: 'agent_changesets',
    columns: [
      'id',
      'document_id',
      'tab_id',
      'rev',
      'base_rev',
      'author_id',
      'author_name',
      'author_color',
      'token_id',
      'summary',
      'fingerprints',
      'added',
      'changed',
      'removed',
      'created_tab',
      'revert_of',
      'created_at',
    ],
    sortBy: ['id'],
    where: 'document_id = ?1',
  },
  {
    table: 'agent_changeset_parts',
    columns: ['changeset_id', 'part', 'data'],
    sortBy: ['changeset_id', 'part'],
    where: 'changeset_id IN (SELECT id FROM agent_changesets WHERE document_id = ?1)',
  },
  {
    table: 'items',
    columns: [
      'document_id',
      'id',
      'type',
      'item_key',
      'rank',
      'fields',
      'rev',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ],
    sortBy: ['id'],
    where: 'document_id = ?1',
  },
  {
    table: 'sheets',
    columns: [
      'document_id',
      'id',
      'tab_id',
      'title',
      'layout',
      'rev',
      'cell_count',
      'cell_bytes',
      'unreferenced_since',
      'write_nonce',
      'created_at',
      'updated_at',
      'updated_by',
      'delete_when_unreferenced',
    ],
    sortBy: ['id'],
    where: 'document_id = ?1',
  },
  {
    table: 'sheet_cells',
    columns: ['document_id', 'sheet_id', 'row_id', 'col_id', 'input', 'format'],
    sortBy: ['sheet_id', 'row_id', 'col_id'],
    where: 'document_id = ?1',
  },
  {
    table: 'sheet_refs',
    columns: ['tab_id', 'sheet_id'],
    sortBy: ['tab_id', 'sheet_id'],
    where: `tab_id IN (${OWN_TABS})`,
  },
];

/** The rows each copied table holds for one document, as SQL answers them. */
export type MovableRows = Record<string, Record<string, unknown>[]>;

/** Each copied table's rows as tuples in column order, sorted by key; `document` is the one tuple (or null). */
export type CanonicalContent = Record<string, unknown> & {
  document: unknown[] | null;
  tabs: unknown[][];
};

/** One SELECT per copied table for document `?1`; `head` names the document table where it differs. */
export function movableSelects(head: 'documents' | 'document'): { table: string; sql: string }[] {
  return MOVABLE_TABLES.map(({ table, columns, sortBy, where }) => {
    const from = table === 'document' ? head : table;
    const order = sortBy.length > 0 ? ` ORDER BY ${sortBy.join(', ')}` : '';
    return { table, sql: `SELECT ${columns.join(', ')} FROM ${from} WHERE ${where}${order}` };
  });
}

function tuple(row: Record<string, unknown>, columns: readonly string[]): unknown[] {
  return columns.map((c) => {
    const v = row[c];
    if (v === undefined) return null;
    return typeof v === 'bigint' ? Number(v) : v;
  });
}

const byTuple = (sortIdx: readonly number[]) => (a: unknown[], b: unknown[]) => {
  for (const i of sortIdx) {
    const x = String(a[i]);
    const y = String(b[i]);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

/** The rows as canonical tuples: fixed column order, sorted by key, whatever order SQL answered in. */
export function canonicalContent(rows: MovableRows): CanonicalContent {
  const out: Record<string, unknown> = {};
  for (const { table, columns, sortBy } of MOVABLE_TABLES) {
    const tuples = (rows[table] ?? []).map((r) => tuple(r, columns));
    if (table === 'document') {
      out.document = tuples[0] ?? null;
      continue;
    }
    out[table] = tuples.sort(byTuple(sortBy.map((c) => columns.indexOf(c))));
  }
  return out as CanonicalContent;
}

/** The canonical content as the one JSON text its hash is taken over: equal texts are equal content. */
export function canonicalJson(content: CanonicalContent): string {
  return JSON.stringify(MOVABLE_TABLES.map(({ table }) => content[table] ?? null));
}

/** SHA-256 over the canonical content's JSON, lower-case hex; the same in Workers and in Node. */
export async function contentHashOf(content: CanonicalContent): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
