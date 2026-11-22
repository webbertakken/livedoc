// A spreadsheet's kept content in its room (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content):
// the standard it is of and its bytes on the workbook row; its items and relationships by seq, in the file's order;
// its package entries by name, their bytes in chunks of KEPT_CHUNK_BYTES under the room's row cap (D114).
import {
  isKeptPlace,
  type KeptContent,
  type KeptItem,
  type KeptPart,
  type KeptRelationship,
  type KeptStandard,
  type StoredAt,
} from '@livedoc/sheets/files';
import type { DocumentEnv } from '../types';
import { fromBlob, toBlob } from './blob';

/** The bytes of one stored chunk of a kept entry (D114), well under the room's 2 MB row. */
export const KEPT_CHUNK_BYTES = 1024 * 1024;

/** What a spreadsheet keeps already, as an arriving request is checked against it; null for no spreadsheet. */
export type KeptStored = {
  standard: KeptStandard | null;
  bytes: number;
  sheetIds: ReadonlySet<string>;
  partNames: ReadonlySet<string>;
  // The next seq of an item, a relationship and an entry.
  next: { items: number; relationships: number; parts: number };
};

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optional = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

// A relationship's source, as the table's CHECK holds it.
const sourceOf = (value: unknown): KeptRelationship<StoredAt>['from'] =>
  value === 'package' || value === 'sheet' ? value : 'workbook';

function standardOf(value: unknown): KeptStandard | null {
  return value === 'odf' || value === 'ooxml' ? value : null;
}

function jsonOf<T>(documentId: string, value: unknown, fallback: T): T {
  try {
    return JSON.parse(text(value)) as T;
  } catch {
    console.warn('[workbook] unreadable kept row', { documentId });
    return fallback;
  }
}

const anchor = (sheet: unknown, r?: unknown, c?: unknown): StoredAt => ({
  ...(optional(sheet) !== undefined ? { sheet: text(sheet) } : {}),
  ...(optional(r) !== undefined ? { r: text(r) } : {}),
  ...(optional(c) !== undefined ? { c: text(c) } : {}),
});

// Every row a query answers, in its order.
async function rowsOf(env: DocumentEnv, query: string, ...binds: unknown[]): Promise<Row[]> {
  return (
    await env.DOCUMENT_DB.prepare(query)
      .bind(...binds)
      .all<Row>()
  ).results;
}

/** What the spreadsheet keeps already, for checking a request; null when the document is no spreadsheet. */
export async function keptStored(env: DocumentEnv, documentId: string): Promise<KeptStored | null> {
  const [row] = await rowsOf(
    env,
    'SELECT kept_standard, kept_bytes FROM workbook WHERE document_id = ?',
    documentId,
  );
  if (!row) return null;
  const sheets = await rowsOf(env, 'SELECT id FROM sheets WHERE document_id = ?', documentId);
  const parts = await rowsOf(
    env,
    'SELECT name FROM workbook_kept_parts WHERE document_id = ?',
    documentId,
  );
  const [next] = await rowsOf(
    env,
    `SELECT (SELECT COALESCE(MAX(seq) + 1, 0) FROM workbook_kept_items WHERE document_id = ?) AS items,
            (SELECT COALESCE(MAX(seq) + 1, 0) FROM workbook_kept_relationships WHERE document_id = ?) AS rels,
            (SELECT COALESCE(MAX(seq) + 1, 0) FROM workbook_kept_parts WHERE document_id = ?) AS parts`,
    documentId,
    documentId,
    documentId,
  );
  return {
    standard: standardOf(row.kept_standard),
    bytes: Number(row.kept_bytes),
    sheetIds: new Set(sheets.map((r) => text(r.id))),
    partNames: new Set(parts.map((r) => text(r.name))),
    next: {
      items: Number(next?.items),
      relationships: Number(next?.rels),
      parts: Number(next?.parts),
    },
  };
}

function chunked(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < data.byteLength; at += KEPT_CHUNK_BYTES)
    out.push(data.subarray(at, at + KEPT_CHUNK_BYTES));
  return out;
}

/**
 * The statements that add kept content after what is stored (`from`, the next seqs), and count its `bytes` on the
 * workbook row, naming its standard: run as one batch, so a refused write stores nothing.
 */
export function keptAddStatements(
  env: DocumentEnv,
  documentId: string,
  kept: KeptContent<StoredAt>,
  from: KeptStored['next'],
  bytes: number,
): D1PreparedStatement[] {
  const db = env.DOCUMENT_DB;
  const statements = [
    db
      .prepare(
        'UPDATE workbook SET kept_standard = ?, kept_bytes = kept_bytes + ? WHERE document_id = ?',
      )
      .bind(kept.standard, bytes, documentId),
  ];
  for (const [i, item] of kept.items.entries())
    statements.push(
      db
        .prepare(
          `INSERT INTO workbook_kept_items (document_id, seq, place, xml, ns, sheet_id, row_id, col_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          documentId,
          from.items + i,
          item.place,
          item.xml,
          JSON.stringify(item.ns),
          item.at.sheet ?? null,
          item.at.r ?? null,
          item.at.c ?? null,
        ),
    );
  for (const [i, rel] of kept.relationships.entries())
    statements.push(
      db
        .prepare(
          `INSERT INTO workbook_kept_relationships (document_id, seq, source, sheet_id, rel_id, type, target, external)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          documentId,
          from.relationships + i,
          rel.from,
          rel.at.sheet ?? null,
          rel.id,
          rel.type,
          rel.target,
          rel.external ? 1 : 0,
        ),
    );
  for (const [i, part] of kept.parts.entries()) {
    statements.push(
      db
        .prepare(
          'INSERT INTO workbook_kept_parts (document_id, name, seq, type, rels, size) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          documentId,
          part.name,
          from.parts + i,
          part.type,
          JSON.stringify(part.rels),
          part.data.byteLength,
        ),
      ...chunked(part.data).map((chunk, idx) =>
        db
          .prepare(
            'INSERT INTO workbook_kept_chunks (document_id, name, idx, bytes) VALUES (?, ?, ?, ?)',
          )
          .bind(documentId, part.name, idx, toBlob(chunk)),
      ),
    );
  }
  return statements;
}

// An entry's bytes from its chunks in order; one whose chunks do not add up to its size is left out, logged.
function partsOf(documentId: string, parts: Row[], chunks: Row[]): KeptPart[] {
  const byName = new Map<string, Uint8Array[]>();
  for (const chunk of chunks) {
    const name = text(chunk.name);
    byName.set(name, [...(byName.get(name) ?? []), fromBlob(chunk.bytes)]);
  }
  return parts.flatMap((row) => {
    const pieces = byName.get(text(row.name)) ?? [];
    const size = pieces.reduce((n, piece) => n + piece.byteLength, 0);
    if (size !== Number(row.size)) {
      console.warn('[workbook] kept entry short', {
        documentId,
        name: row.name,
        size,
        stored: row.size,
      });
      return [];
    }
    const data = new Uint8Array(size);
    let at = 0;
    for (const piece of pieces) {
      data.set(piece, at);
      at += piece.byteLength;
    }
    return [
      { name: text(row.name), type: text(row.type), data, rels: jsonOf(documentId, row.rels, []) },
    ];
  });
}

/** The spreadsheet's kept content whole, anchored by id; undefined when it keeps none. */
export async function readKept(
  env: DocumentEnv,
  documentId: string,
): Promise<KeptContent<StoredAt> | undefined> {
  const [book] = await rowsOf(
    env,
    'SELECT kept_standard FROM workbook WHERE document_id = ?',
    documentId,
  );
  const standard = standardOf(book?.kept_standard);
  if (!standard) return undefined;
  const items = await rowsOf(
    env,
    'SELECT place, xml, ns, sheet_id, row_id, col_id FROM workbook_kept_items WHERE document_id = ? ORDER BY seq',
    documentId,
  );
  const rels = await rowsOf(
    env,
    `SELECT source, sheet_id, rel_id, type, target, external FROM workbook_kept_relationships
      WHERE document_id = ? ORDER BY seq`,
    documentId,
  );
  const parts = await rowsOf(
    env,
    'SELECT name, type, rels, size FROM workbook_kept_parts WHERE document_id = ? ORDER BY seq',
    documentId,
  );
  const chunks = await rowsOf(
    env,
    'SELECT name, idx, bytes FROM workbook_kept_chunks WHERE document_id = ? ORDER BY name, idx',
    documentId,
  );
  return {
    standard,
    items: items.flatMap((row): KeptItem<StoredAt>[] => {
      if (!isKeptPlace(row.place)) {
        console.warn('[workbook] unreadable kept row', { documentId, place: row.place });
        return [];
      }
      const ns = jsonOf(documentId, row.ns, {});
      return [
        {
          place: row.place,
          xml: text(row.xml),
          ns,
          at: anchor(row.sheet_id, row.row_id, row.col_id),
        },
      ];
    }),
    relationships: rels.map((row) => ({
      id: text(row.rel_id),
      type: text(row.type),
      target: text(row.target),
      ...(row.external === 1 ? { external: true } : {}),
      from: sourceOf(row.source),
      at: anchor(row.sheet_id),
    })),
    parts: partsOf(documentId, parts, chunks),
  };
}
