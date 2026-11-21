// A live tab's digest in its room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): rebuilt from the
// stored state when the outbox drains the tab, so the listing's counts and has-content, and content search, never read
// the state per keystroke. Its search text is never kept in the room: the drain gives it to D1.
import type { DocumentEnv } from '../types';
import type { LiveTabDigest, LiveTabKind } from './live-tab-kind';
import { storedUpdates } from './live-tab-store';

/** Rebuild the tab's digest from its state and keep it beside the tab, the document saved; answers it. */
export async function refreshLiveTabDigest(
  env: DocumentEnv,
  kind: LiveTabKind,
  documentId: string,
  tabId: string,
): Promise<LiveTabDigest> {
  const started = Date.now();
  const updates = await storedUpdates(env, kind, tabId);
  const digest = kind.state.digest(updates);
  const stateBytes = updates.reduce((n, u) => n + u.byteLength, 0);
  const now = Date.now();
  // The content changed since the last drain: the document is saved now, for Modified and the thumbnail.
  const saved = env.DOCUMENT_DB.prepare(
    'UPDATE document SET saved_at = MAX(saved_at, ?2) WHERE id = ?1',
  ).bind(documentId, now);
  const written = env.DOCUMENT_DB.prepare(
    `INSERT INTO ${kind.tables.digest} (tab_id, characters, words, pages, has_content, state_bytes, written_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(tab_id) DO UPDATE SET
       characters = excluded.characters,
       words = excluded.words,
       pages = excluded.pages,
       has_content = excluded.has_content,
       state_bytes = excluded.state_bytes,
       written_at = excluded.written_at`,
  ).bind(
    tabId,
    digest.characters,
    digest.words,
    digest.pages,
    digest.hasContent ? 1 : 0,
    stateBytes,
    now,
  );
  await env.DOCUMENT_DB.batch([written, saved]);
  console.info(
    `${kind.tag} digest document=${documentId} tab=${tabId} characters=${digest.characters} words=${digest.words} bytes=${stateBytes} ms=${Date.now() - started}`,
  );
  return digest;
}
