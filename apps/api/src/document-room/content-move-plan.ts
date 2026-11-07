// The operator's tool for the move of content into rooms (docs/specs/006-document/document-storage-move.md "The
// operator's tool", docs/specs/006-document/document-storage-move.md): `plan` before the
// release, `verify` after. It only reads: every statement must be one SELECT, checked before anything runs.
//
// The pure core: the shell (content-move.ts) hands it a query function over wrangler; tests hand it node:sqlite.

import { canonicalContent, contentHashOf, movableSelects, type MovableRows } from './content-hash';

/** Runs SELECT statements in one call and answers each one's rows, in order. */
export type Query = (statements: string[]) => Promise<Record<string, unknown>[][]>;

export type PlannedDocument = { id: string; tabs: number; bytes: number; hash: string };

export type VerifiedDocument = {
  id: string;
  status: string | null;
  planned: string | null;
  recomputed: string;
  d1Hash: string | null;
  roomHash: string | null;
  problem: string | null;
};

export type Verification = { pass: boolean; rows: VerifiedDocument[] };

/** Refuse anything but a single SELECT: the tool never writes. */
export function assertSelect(statement: string): void {
  const text = statement.trim().replace(/;$/, '');
  if (!/^select\b/i.test(text))
    throw new Error(`content-move: only SELECT may run, not: ${text.slice(0, 40)}`);
  if (text.includes(';')) throw new Error('content-move: one statement at a time');
}

/** A document id as a quoted SQL literal in place of `?1` (wrangler's --command takes no bindings). */
export function inlineId(statement: string, id: string): string {
  return statement.replaceAll('?1', `'${id.replaceAll("'", "''")}'`);
}

async function select(query: Query, statements: string[]): Promise<Record<string, unknown>[][]> {
  for (const s of statements) assertSelect(s);
  return query(statements);
}

async function documentIds(query: Query): Promise<string[]> {
  const [rows] = await select(query, ['SELECT id FROM documents ORDER BY id']);
  return (rows ?? []).map((r) => String(r.id));
}

async function planDocument(query: Query, id: string): Promise<PlannedDocument> {
  const selects = movableSelects('documents');
  const answers = await select(
    query,
    selects.map((s) => inlineId(s.sql, id)),
  );
  const rows: MovableRows = {};
  selects.forEach((s, i) => (rows[s.table] = answers[i] ?? []));
  const tabs = rows.tabs ?? [];
  const bytes = tabs.reduce((n, t) => n + new TextEncoder().encode(String(t.data)).length, 0);
  return {
    id,
    tabs: (rows.document_tabs ?? []).length,
    bytes,
    hash: await contentHashOf(canonicalContent(rows)),
  };
}

/** Every document's tab count, content bytes and content hash, computed from D1. */
export async function planOf(query: Query): Promise<PlannedDocument[]> {
  const out: PlannedDocument[] = [];
  for (const id of await documentIds(query)) out.push(await planDocument(query, id));
  return out;
}

type MoveRow = {
  document_id: string;
  status: string;
  born: number;
  d1_tabs: number | null;
  room_tabs: number | null;
  d1_hash: string | null;
  room_hash: string | null;
};

function problemOf(
  move: MoveRow | undefined,
  planned: PlannedDocument | undefined,
  now: PlannedDocument,
) {
  if (!move) return 'not moved';
  if (move.status !== 'moved') return `status ${move.status}`;
  // Created or copied in its room: D1 never held its content, so there is nothing to compare.
  if (move.born === 1) return null;
  if (move.d1_hash !== move.room_hash) return 'room differs from D1';
  if (move.d1_tabs !== move.room_tabs) return 'tab counts differ';
  if (move.d1_hash !== now.hash) return 'D1 differs from the recorded move';
  if (planned && planned.hash !== now.hash) return 'changed since the plan';
  return null;
}

/** Every document moved, both sides of its record agreeing, and D1 (recomputed) matching the plan. */
export async function verifyOf(
  query: Query,
  plan: readonly PlannedDocument[],
): Promise<Verification> {
  const [moves] = await select(query, [
    'SELECT document_id, status, born, d1_tabs, room_tabs, d1_hash, room_hash FROM content_moves',
  ]);
  const byId = new Map(((moves ?? []) as unknown as MoveRow[]).map((m) => [m.document_id, m]));
  const planned = new Map(plan.map((p) => [p.id, p]));
  const rows: VerifiedDocument[] = [];
  const live = new Set(await documentIds(query));
  const ids = [...new Set([...live, ...planned.keys()])].sort();
  for (const id of ids) {
    if (!live.has(id)) {
      // Purged since the plan: nothing left to move or to check.
      rows.push({
        id,
        status: 'gone',
        planned: planned.get(id)?.hash ?? null,
        recomputed: '',
        d1Hash: null,
        roomHash: null,
        problem: null,
      });
      continue;
    }
    const now = await planDocument(query, id);
    const move = byId.get(id);
    rows.push({
      id,
      status: move?.status ?? null,
      planned: planned.get(id)?.hash ?? null,
      recomputed: now.hash,
      d1Hash: move?.d1_hash ?? null,
      roomHash: move?.room_hash ?? null,
      problem: problemOf(move, planned.get(id), now),
    });
  }
  return { pass: rows.every((r) => r.problem === null), rows };
}
