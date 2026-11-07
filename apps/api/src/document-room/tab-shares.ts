// A tab shared between documents (docs/specs/006-document/tab-document-many-to-many.md,
// docs/specs/006-document/document-storage.md). Each document's content lives in its own
// room, so every holder keeps its own copy under the same tab id and lists the OTHER holders in `tab_shares`.
//
// A write to the tab (a save, a rename, a Q&A vote, an agent's changeset) queues a `body` send to each holder from
// the `share_on_write` trigger (document-schema.ts), so no write path can forget it; the room's alarm drains the
// queue (drainShares). A holder keeps the later write, by its time and then by the SHA-256 of its body, so every
// holder settles on the same one. A copy taken in is sent on only to holders the sender did not list (no echo).
//
// Holders come and go by message too: `join` says a document now holds the tab, `leave` that one no longer does. A
// holder that answers `gone` (it no longer holds the tab, or no longer exists) is dropped.

import type { Tab } from '@livedoc/document';
import type { SharedTabsSummary } from '@livedoc/api-schema';
import { tabWriteStatements } from '../db/tabs';
import type { DocumentEnv } from '../types';
import { pooled, PUSH_CONCURRENCY } from './document-outbox';

export type ShareMessage =
  // The tab as the sender holds it, and every holder the sender knows (itself first).
  | {
      kind: 'body';
      tabId: string;
      name: string;
      data: string;
      updatedAt: number;
      members: string[];
    }
  | { kind: 'join'; tabId: string; member: string }
  | { kind: 'leave'; tabId: string };

// `gone`: the receiver does not hold the tab, so the sender stops sending it.
export type ShareAnswer = 'ok' | 'gone';

// What a document joining a tab's holders takes from the document it joins through.
export type SharedTabCopy = {
  name: string;
  data: string;
  updatedAt: number;
  // Every holder the joining document will share the tab with, the one joined through first.
  members: string[];
};

// Messages one drain sends; each is one call to another room, a body up to a tab's size.
export const SHARE_DRAIN_MAX = 50;

type StoredTab = { name: string; data: string; updated_at: number; order_index: number };

async function storedTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<StoredTab | null> {
  return env.DOCUMENT_DB.prepare(
    `SELECT t.name, t.data, t.updated_at, dt.order_index FROM tabs t
       JOIN document_tabs dt ON dt.tab_id = t.id
      WHERE dt.document_id = ? AND t.id = ?`,
  )
    .bind(documentId, tabId)
    .first<StoredTab>();
}

async function holdersOf(env: DocumentEnv, tabId: string): Promise<string[]> {
  const { results } = await env.DOCUMENT_DB.prepare(
    'SELECT document_id FROM tab_shares WHERE tab_id = ? ORDER BY document_id',
  )
    .bind(tabId)
    .all<{ document_id: string }>();
  return results.map((r) => r.document_id);
}

function addHolder(env: DocumentEnv, tabId: string, holder: string): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    'INSERT OR IGNORE INTO tab_shares (tab_id, document_id) VALUES (?, ?)',
  ).bind(tabId, holder);
}

// A holder dropped, with everything still owed to it about the tab.
function dropHolder(env: DocumentEnv, tabId: string, holder: string): D1PreparedStatement[] {
  return [
    env.DOCUMENT_DB.prepare('DELETE FROM tab_shares WHERE tab_id = ? AND document_id = ?').bind(
      tabId,
      holder,
    ),
    env.DOCUMENT_DB.prepare('DELETE FROM share_outbox WHERE tab_id = ? AND to_document = ?').bind(
      tabId,
      holder,
    ),
  ];
}

// One share_outbox key, re-keyed when it was already there, so a drain in flight keeps the newer one.
function enqueue(
  env: DocumentEnv,
  kind: 'body' | 'join' | 'leave',
  tabId: string,
  to: string,
  member = '',
): D1PreparedStatement[] {
  return [
    env.DOCUMENT_DB.prepare(
      'DELETE FROM share_outbox WHERE kind = ? AND tab_id = ? AND to_document = ? AND member = ?',
    ).bind(kind, tabId, to, member),
    env.DOCUMENT_DB.prepare(
      'INSERT INTO share_outbox (kind, tab_id, to_document, member) VALUES (?, ?, ?, ?)',
    ).bind(kind, tabId, to, member),
  ];
}

// ---------- Joining ------------------------------------------------------------------------------------------

// The joining document's first step, asked of the document it joins through: the tab as held there and its
// holders. Records nothing, so a join that fails part way leaves no holder that holds nothing. Null: no such tab.
export async function sharedTabCopy(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<SharedTabCopy | null> {
  const tab = await storedTab(env, documentId, tabId);
  if (!tab) return null;
  return {
    name: tab.name,
    data: tab.data,
    updatedAt: tab.updated_at,
    members: [documentId, ...(await holdersOf(env, tabId))],
  };
}

// Whether this document holds the tab and shares it with `holder`: a repeat of a link through `holder`.
export async function sharesTabWith(
  env: DocumentEnv,
  tabId: string,
  holder: string,
): Promise<boolean> {
  const row = await env.DOCUMENT_DB.prepare(
    'SELECT 1 AS present FROM tab_shares WHERE tab_id = ? AND document_id = ?',
  )
    .bind(tabId, holder)
    .first<{ present: number }>();
  return row !== null;
}

// The joining document's own step: the copy as a new tab at the end of its order, under the same id and dated as
// the copy, and the holders it now shares it with. False when it already holds a tab with that id.
export async function takeSharedTab(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  copy: SharedTabCopy,
): Promise<boolean> {
  const held = await env.DOCUMENT_DB.prepare('SELECT 1 AS present FROM tabs WHERE id = ?')
    .bind(tabId)
    .first<{ present: number }>();
  if (held) return false;
  const position = await env.DOCUMENT_DB.prepare(
    'SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM document_tabs WHERE document_id = ?',
  )
    .bind(documentId)
    .first<{ next: number }>();
  const tab: Tab = {
    ...(JSON.parse(copy.data) as Omit<Tab, 'id' | 'name'>),
    id: tabId,
    name: copy.name,
  };
  await env.DOCUMENT_DB.batch([
    ...tabWriteStatements(env, documentId, tab, position?.next ?? 0, { advance: true }),
    // Dated as the copy, not now: a write a holder made since is then later, and lands here when it comes.
    env.DOCUMENT_DB.prepare('UPDATE tabs SET updated_at = ? WHERE id = ?').bind(
      copy.updatedAt,
      tabId,
    ),
    ...copy.members.filter((m) => m !== documentId).map((m) => addHolder(env, tabId, m)),
  ]);
  return true;
}

// The last step, back on the document joined through: it shares the tab with `member` now, tells the other holders
// so, and sends `member` the tab again when it changed since `seenUpdatedAt`. False: no such tab here.
export async function recordShareJoin(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  member: string,
  seenUpdatedAt: number,
): Promise<boolean> {
  const tab = await storedTab(env, documentId, tabId);
  if (!tab) return false;
  const others = (await holdersOf(env, tabId)).filter((m) => m !== member);
  await env.DOCUMENT_DB.batch([
    addHolder(env, tabId, member),
    ...others.flatMap((m) => enqueue(env, 'join', tabId, m, member)),
    ...(tab.updated_at === seenUpdatedAt ? [] : enqueue(env, 'body', tabId, member)),
  ]);
  return true;
}

// A join whose last step failed: the joined document sends its copy back, which teaches the document joined
// through of it (receiveShares learns a sender it did not list), retried by the drain until it lands.
export async function queueShareBody(env: DocumentEnv, tabId: string, to: string): Promise<void> {
  await env.DOCUMENT_DB.batch(enqueue(env, 'body', tabId, to));
}

// ---------- Leaving ------------------------------------------------------------------------------------------

// A document dropping the tab tells every other holder, and owes them nothing else about it. Before the tab's
// delete, which takes its `tab_shares` rows by the cascade.
export function leaveStatements(env: DocumentEnv, tabId: string): D1PreparedStatement[] {
  return [
    env.DOCUMENT_DB.prepare(
      "DELETE FROM share_outbox WHERE tab_id = ? AND kind IN ('body', 'join')",
    ).bind(tabId),
    env.DOCUMENT_DB.prepare(
      `INSERT OR REPLACE INTO share_outbox (kind, tab_id, to_document)
       SELECT 'leave', tab_id, document_id FROM tab_shares WHERE tab_id = ?`,
    ).bind(tabId),
  ];
}

// Every (tab, holder) pair the document shares: a purged document tells each it left.
export async function allShares(env: DocumentEnv): Promise<{ tabId: string; to: string }[]> {
  const { results } = await env.DOCUMENT_DB.prepare(
    'SELECT tab_id, document_id FROM tab_shares ORDER BY tab_id, document_id',
  ).all<{ tab_id: string; document_id: string }>();
  return results.map((r) => ({ tabId: r.tab_id, to: r.document_id }));
}

// ---------- Receiving ----------------------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Whether `incoming` is the later write: by time, then (two holders in the same millisecond) by the SHA-256 of the
// body, then by name, so every holder keeps the same one.
export async function isLaterWrite(
  incoming: { name: string; data: string; updatedAt: number },
  held: { name: string; data: string; updatedAt: number },
): Promise<boolean> {
  if (incoming.updatedAt !== held.updatedAt) return incoming.updatedAt > held.updatedAt;
  if (incoming.data !== held.data) {
    return (await sha256Hex(incoming.data)) > (await sha256Hex(held.data));
  }
  return incoming.name > held.name;
}

// What another holder (`from`) sent; one answer per message, in order.
export async function receiveShares(
  env: DocumentEnv,
  documentId: string,
  from: string,
  messages: readonly ShareMessage[],
): Promise<ShareAnswer[]> {
  const answers: ShareAnswer[] = [];
  for (const message of messages) answers.push(await receiveOne(env, documentId, from, message));
  return answers;
}

async function receiveOne(
  env: DocumentEnv,
  documentId: string,
  from: string,
  message: ShareMessage,
): Promise<ShareAnswer> {
  const { tabId } = message;
  if (message.kind === 'leave') {
    await env.DOCUMENT_DB.batch(dropHolder(env, tabId, from));
    return 'ok';
  }
  const held = await storedTab(env, documentId, tabId);
  if (!held) return 'gone';
  // A sender this document has not listed yet (its join is still on its way) becomes a holder.
  const learn = addHolder(env, tabId, from);
  if (message.kind === 'join') {
    const statements = [learn];
    if (message.member !== documentId) statements.push(addHolder(env, tabId, message.member));
    await env.DOCUMENT_DB.batch(statements);
    return 'ok';
  }
  const later = await isLaterWrite(message, {
    name: held.name,
    data: held.data,
    updatedAt: held.updated_at,
  });
  if (!later) {
    await learn.run();
    return 'ok';
  }
  // No echo: the sender sent to every holder it lists, so this document sends on only to the ones it did not.
  const informed = new Set([from, ...message.members, documentId]);
  const uninformed = (await holdersOf(env, tabId)).filter((m) => !informed.has(m));
  const tab: Tab = {
    ...(JSON.parse(message.data) as Omit<Tab, 'id' | 'name'>),
    id: tabId,
    name: message.name,
  };
  await env.DOCUMENT_DB.batch([
    // Taken in as a local write (stats, image and sheet references, the outbox's keys), sending nothing back.
    env.DOCUMENT_DB.prepare('UPDATE share_state SET receiving = 1'),
    ...tabWriteStatements(env, documentId, tab, held.order_index, { advance: true }),
    env.DOCUMENT_DB.prepare('UPDATE tabs SET updated_at = ? WHERE id = ?').bind(
      message.updatedAt,
      tabId,
    ),
    env.DOCUMENT_DB.prepare('UPDATE share_state SET receiving = 0'),
    learn,
    ...uninformed.flatMap((m) => enqueue(env, 'body', tabId, m)),
  ]);
  return 'ok';
}

// ---------- Sending ------------------------------------------------------------------------------------------

type ShareRow = {
  id: number;
  kind: 'body' | 'join' | 'leave';
  tab_id: string;
  to_document: string;
  member: string;
};

export type ShareDrain = { sent: number; failed: number; gone: number; more: boolean };

export type ShareSend = (to: string, messages: ShareMessage[]) => Promise<ShareAnswer[]>;

// Send what share_outbox holds: at most SHARE_DRAIN_MAX messages, PUSH_CONCURRENCY at once, each a call to the
// room it is for. A message sent is deleted by the id read, so one written again meanwhile stays; one that failed
// stays for the next drain; a holder that answered `gone` is dropped, with whatever else it was owed about the tab.
export async function drainShares(
  env: DocumentEnv,
  documentId: string,
  send: ShareSend,
): Promise<ShareDrain> {
  const rows = (
    await env.DOCUMENT_DB.prepare(
      'SELECT id, kind, tab_id, to_document, member FROM share_outbox ORDER BY id LIMIT ?',
    )
      .bind(SHARE_DRAIN_MAX + 1)
      .all<ShareRow>()
  ).results;
  const more = rows.length > SHARE_DRAIN_MAX;
  // A tab sent to several holders is read once a drain.
  const bodies = new Map<string, Promise<ShareMessage | null>>();
  const messageOf = (row: ShareRow): Promise<ShareMessage | null> => {
    if (row.kind === 'leave') return Promise.resolve({ kind: 'leave', tabId: row.tab_id });
    if (row.kind === 'join') {
      return Promise.resolve({ kind: 'join', tabId: row.tab_id, member: row.member });
    }
    if (!bodies.has(row.tab_id)) bodies.set(row.tab_id, bodyOf(env, documentId, row.tab_id));
    return bodies.get(row.tab_id)!;
  };
  const outcomes = await pooled(
    rows.slice(0, SHARE_DRAIN_MAX).map((row) => async () => {
      const message = await messageOf(row);
      // Nothing left to say (the tab went since): the key goes.
      if (!message) return { row, outcome: 'skipped' as const };
      try {
        const [answer = 'ok'] = await send(row.to_document, [message]);
        console.info(
          `[tab-shares] sent id=${documentId} to=${row.to_document} kind=${row.kind} answer=${answer}`,
        );
        return { row, outcome: answer };
      } catch (error) {
        console.warn(
          `[tab-shares] send failed id=${documentId} to=${row.to_document} kind=${row.kind}`,
          error,
        );
        return { row, outcome: 'failed' as const };
      }
    }),
    PUSH_CONCURRENCY,
  );
  let gone = 0;
  const done: number[] = [];
  for (const { row, outcome } of outcomes) {
    if (outcome === 'failed') continue;
    if (outcome === 'gone') {
      gone += 1;
      console.info(
        `[tab-shares] holder gone id=${documentId} tab=${row.tab_id} holder=${row.to_document}`,
      );
      await env.DOCUMENT_DB.batch(dropHolder(env, row.tab_id, row.to_document));
      continue;
    }
    done.push(row.id);
  }
  if (done.length > 0) {
    await env.DOCUMENT_DB.prepare(
      'DELETE FROM share_outbox WHERE id IN (SELECT value FROM json_each(?))',
    )
      .bind(JSON.stringify(done))
      .run();
  }
  const failed = outcomes.filter((o) => o.outcome === 'failed').length;
  const sent = outcomes.length - failed - outcomes.filter((o) => o.outcome === 'skipped').length;
  return { sent, failed, gone, more };
}

async function bodyOf(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<ShareMessage | null> {
  const tab = await storedTab(env, documentId, tabId);
  if (!tab) return null;
  return {
    kind: 'body',
    tabId,
    name: tab.name,
    data: tab.data,
    updatedAt: tab.updated_at,
    members: [documentId, ...(await holdersOf(env, tabId))],
  };
}

// ---------- The notice ---------------------------------------------------------------------------------------

// How many of the document's tabs other documents also hold, and how many documents: what deleting it or taking it
// offline leaves in those ("Shared-tab notice").
export async function sharedTabsSummary(
  env: DocumentEnv,
  documentId: string,
): Promise<SharedTabsSummary> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT COUNT(DISTINCT s.tab_id) AS tabs, COUNT(DISTINCT s.document_id) AS documents
       FROM tab_shares s JOIN document_tabs dt ON dt.tab_id = s.tab_id
      WHERE dt.document_id = ? AND s.document_id <> dt.document_id`,
  )
    .bind(documentId)
    .first<SharedTabsSummary>();
  return { tabs: row?.tabs ?? 0, documents: row?.documents ?? 0 };
}
