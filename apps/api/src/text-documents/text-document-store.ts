// A text document's live state in its room (docs/specs/034-text-documents/live-editing-and-storage.md "Storage"):
// the room is the one writer; every update is appended as it is applied, and compaction folds the log into chunks
// under the row cap. Read as the seed merged with the chunks and the log, in order.
import {
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_LOG_UPDATES,
  TextDocumentState,
} from '@livedoc/text-documents';
import { tabKindOf, textDocumentFormatOf, type TextDocumentFormat } from '@livedoc/document';
import type { DocumentEnv } from '../types';

const toBlob = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;
const fromBlob = (value: unknown): Uint8Array =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value as ArrayLike<number>);

/** The text document tab as stored: its format; null when the document lacks the tab or it is another kind. */
export async function storedTextDocumentTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<{ format: TextDocumentFormat } | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT t.data FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE t.id = ? AND dt.document_id = ?`,
  )
    .bind(tabId, documentId)
    .first<{ data: string }>();
  if (!row) return null;
  try {
    const data = JSON.parse(row.data) as { kind?: string; format?: unknown };
    if (tabKindOf(data) !== 'text-document') return null;
    return { format: textDocumentFormatOf(data) };
  } catch {
    return null;
  }
}

/** The stored updates of a text document, chunks first, in order (the seed not included). */
export async function storedUpdates(env: DocumentEnv, tabId: string): Promise<Uint8Array[]> {
  const chunks = await env.DOCUMENT_DB.prepare(
    'SELECT bytes FROM text_document_chunks WHERE tab_id = ? ORDER BY idx',
  )
    .bind(tabId)
    .all<{ bytes: unknown }>();
  const log = await env.DOCUMENT_DB.prepare(
    'SELECT bytes FROM text_document_updates WHERE tab_id = ? ORDER BY seq',
  )
    .bind(tabId)
    .all<{ bytes: unknown }>();
  // The chunks are one encoded update split across rows; the log's rows are updates each.
  const chunked = chunks.results.map((r) => fromBlob(r.bytes));
  const joined = chunked.length > 0 ? [concat(chunked)] : [];
  return [...joined, ...log.results.map((r) => fromBlob(r.bytes))];
}

/** The whole state as one update: the seed, the chunks and the log. */
export async function readTextDocumentState(env: DocumentEnv, tabId: string): Promise<Uint8Array> {
  return TextDocumentState.merge(await storedUpdates(env, tabId));
}

/** The log as compaction weighs it: its bytes and its count of updates. */
export type LogSize = { bytes: number; updates: number };

/** Append one update to the log; answers the log's size after it, for the compaction check. */
export async function appendTextDocumentUpdate(
  env: DocumentEnv,
  tabId: string,
  update: Uint8Array,
): Promise<LogSize> {
  await env.DOCUMENT_DB.prepare(
    `INSERT INTO text_document_updates (tab_id, seq, bytes)
     VALUES (?, COALESCE((SELECT MAX(seq) FROM text_document_updates WHERE tab_id = ?), 0) + 1, ?)`,
  )
    .bind(tabId, tabId, toBlob(update))
    .run();
  const size = await env.DOCUMENT_DB.prepare(
    'SELECT COALESCE(SUM(LENGTH(bytes)), 0) AS bytes, COUNT(*) AS updates FROM text_document_updates WHERE tab_id = ?',
  )
    .bind(tabId)
    .first<LogSize>();
  return { bytes: size?.bytes ?? 0, updates: size?.updates ?? 0 };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** The encoded state split into rows of at most `size` bytes. */
export function chunksOf(state: Uint8Array, size = TEXT_DOCUMENT_CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < state.byteLength; at += size) out.push(state.subarray(at, at + size));
  return out;
}

/** Store a whole state for a tab that holds none yet (a copy, "Copies"): one update in the log when a row holds it,
 *  else folded straight into the chunks. */
export async function storeTextDocumentState(
  env: DocumentEnv,
  tabId: string,
  state: Uint8Array,
): Promise<void> {
  if (state.byteLength <= TEXT_DOCUMENT_CHUNK_BYTES)
    await appendTextDocumentUpdate(env, tabId, state);
  else await compactTextDocument(env, tabId, state);
}

/** Whether the log has grown past the size or the count compaction keeps it to. */
export const compactionDue = (log: LogSize): boolean =>
  log.bytes > TEXT_DOCUMENT_LOG_BYTES || log.updates > TEXT_DOCUMENT_LOG_UPDATES;

/** Fold the log into chunks, as one transaction: the merged state replaces both. Answers the chunk count.
 *  `extra`: an update folded in with them, one no row of the log could hold ("Sending"). */
export async function compactTextDocument(
  env: DocumentEnv,
  tabId: string,
  extra?: Uint8Array,
): Promise<number> {
  const merged = TextDocumentState.merge([
    ...(await storedUpdates(env, tabId)),
    ...(extra ? [extra] : []),
  ]);
  const rev = Date.now();
  const chunks = chunksOf(merged);
  await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare('DELETE FROM text_document_chunks WHERE tab_id = ?').bind(tabId),
    env.DOCUMENT_DB.prepare('DELETE FROM text_document_updates WHERE tab_id = ?').bind(tabId),
    ...chunks.map((chunk, idx) =>
      env.DOCUMENT_DB.prepare(
        'INSERT INTO text_document_chunks (tab_id, idx, rev, bytes) VALUES (?, ?, ?, ?)',
      ).bind(tabId, idx, rev, toBlob(chunk)),
    ),
  ]);
  return chunks.length;
}
