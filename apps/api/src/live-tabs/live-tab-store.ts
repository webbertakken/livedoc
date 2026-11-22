// A live tab's state in its room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): the room is the
// one writer; every update is appended as it is applied, and compaction folds the log into chunks under the row cap.
// Read as the chunks and the log, in order, merged by the kind.
import type { DocumentEnv } from '../types';
import type { LiveTabKind } from './live-tab-kind';

const toBlob = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;
const fromBlob = (value: unknown): Uint8Array =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value as ArrayLike<number>);

/** A live tab's row as a replacement reads it: its body, and what a write of it at the revision read needs. */
export type StoredLiveTabRow = {
  body: Record<string, unknown>;
  name: string;
  rev: number;
  orderIndex: number;
};

/** The tab's row, when the document holds the tab and it is of the kind; else null. */
export async function storedLiveTabRow(
  env: DocumentEnv,
  kind: LiveTabKind,
  documentId: string,
  tabId: string,
): Promise<StoredLiveTabRow | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT t.data, t.name, t.rev, dt.order_index FROM tabs t JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE t.id = ? AND dt.document_id = ?`,
  )
    .bind(tabId, documentId)
    .first<{ data: string; name: string; rev: number; order_index: number }>();
  if (!row) return null;
  try {
    const body = JSON.parse(row.data) as Record<string, unknown>;
    if (body.kind !== kind.tabKind) return null;
    return { body, name: row.name, rev: row.rev, orderIndex: row.order_index };
  } catch {
    return null;
  }
}

/** The tab's body as stored, when the document holds the tab and it is of the kind; else null. */
export async function storedLiveTab(
  env: DocumentEnv,
  kind: LiveTabKind,
  documentId: string,
  tabId: string,
): Promise<Record<string, unknown> | null> {
  return (await storedLiveTabRow(env, kind, documentId, tabId))?.body ?? null;
}

/** The stored updates of a live tab, the chunks first, in order. */
export async function storedUpdates(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
): Promise<Uint8Array[]> {
  const { chunks, updates } = kind.tables;
  const [chunked, log] = await env.DOCUMENT_DB.batch([
    env.DOCUMENT_DB.prepare(`SELECT bytes FROM ${chunks} WHERE tab_id = ? ORDER BY idx`).bind(
      tabId,
    ),
    env.DOCUMENT_DB.prepare(`SELECT bytes FROM ${updates} WHERE tab_id = ? ORDER BY seq`).bind(
      tabId,
    ),
  ]);
  // The chunks are one encoded update split across rows; the log's rows are updates each.
  const parts = ((chunked?.results ?? []) as { bytes: unknown }[]).map((r) => fromBlob(r.bytes));
  const joined = parts.length > 0 ? [concat(parts)] : [];
  return [
    ...joined,
    ...((log?.results ?? []) as { bytes: unknown }[]).map((r) => fromBlob(r.bytes)),
  ];
}

/** The whole state as one update: the chunks and the log, merged. */
export async function readLiveTabState(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
): Promise<Uint8Array> {
  return kind.state.merge(await storedUpdates(env, kind, tabId));
}

/** The log as compaction weighs it: its bytes and its count of updates. */
export type LogSize = { bytes: number; updates: number };

/** Append one update to the log; answers the log's size after it, for the compaction check. */
export async function appendLiveTabUpdate(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  update: Uint8Array,
): Promise<LogSize> {
  const { updates } = kind.tables;
  await env.DOCUMENT_DB.prepare(
    `INSERT INTO ${updates} (tab_id, seq, bytes)
     VALUES (?, COALESCE((SELECT MAX(seq) FROM ${updates} WHERE tab_id = ?), 0) + 1, ?)`,
  )
    .bind(tabId, tabId, toBlob(update))
    .run();
  const size = await env.DOCUMENT_DB.prepare(
    `SELECT COALESCE(SUM(LENGTH(bytes)), 0) AS bytes, COUNT(*) AS updates FROM ${updates} WHERE tab_id = ?`,
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
export function chunksOf(state: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < state.byteLength; at += size) out.push(state.subarray(at, at + size));
  return out;
}

/** The statements that store a whole state as chunks under a tab id (a copy's, "Copies"). */
export function chunkStatements(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  state: Uint8Array,
  rev: number,
): D1PreparedStatement[] {
  return chunksOf(state, kind.sizes.chunkBytes).map((chunk, idx) =>
    env.DOCUMENT_DB.prepare(
      `INSERT INTO ${kind.tables.chunks} (tab_id, idx, rev, bytes) VALUES (?, ?, ?, ?)`,
    ).bind(tabId, idx, rev, toBlob(chunk)),
  );
}

/**
 * The statements that replace a tab's whole state ("Replacing a state with its row"): the log and the chunks go,
 * and `state`, when there is one, is written as chunks. For a batch that writes the tab's row with them.
 */
export function replaceStateStatements(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  state: Uint8Array | null,
  rev: number,
): D1PreparedStatement[] {
  return [
    env.DOCUMENT_DB.prepare(`DELETE FROM ${kind.tables.chunks} WHERE tab_id = ?`).bind(tabId),
    env.DOCUMENT_DB.prepare(`DELETE FROM ${kind.tables.updates} WHERE tab_id = ?`).bind(tabId),
    ...(state ? chunkStatements(env, kind, tabId, state, rev) : []),
  ];
}

/** Store a whole state for a tab that holds none yet: one update in the log when a row holds it, else chunks. */
export async function storeLiveTabState(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  state: Uint8Array,
): Promise<void> {
  if (state.byteLength <= kind.sizes.chunkBytes) await appendLiveTabUpdate(env, kind, tabId, state);
  else await compactLiveTab(env, kind, tabId, state);
}

/** Whether the log has grown past the size or the count compaction keeps it to. */
export const compactionDue = (kind: LiveTabKind, log: LogSize): boolean =>
  log.bytes > kind.sizes.logBytes || log.updates > kind.sizes.logUpdates;

/**
 * Fold the log into chunks, as one batch: the merged state replaces both. Answers the chunk count. `extra`: an update
 * folded in with them, one no row of the log could hold.
 */
export async function compactLiveTab(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  extra?: Uint8Array,
): Promise<number> {
  const merged = kind.state.merge([
    ...(await storedUpdates(env, kind, tabId)),
    ...(extra ? [extra] : []),
  ]);
  const statements = replaceStateStatements(env, kind, tabId, merged, Date.now());
  await env.DOCUMENT_DB.batch(statements);
  // Two of them empty the tables; the rest are the chunks.
  return statements.length - 2;
}
