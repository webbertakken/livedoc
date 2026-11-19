// A text document's digest in its room (docs/specs/034-text-documents/live-editing-and-storage.md "The digest"):
// rebuilt from the stored state when the outbox drains the tab, so the listing's counts and has-content, and content
// search, never read the state per keystroke.
import {
  TextDocumentState,
  textDocumentDigest,
  type TextDocumentDigest,
} from '@livedoc/text-documents';
import type { DocumentEnv } from '../types';
import { storedUpdates } from './text-document-store';

/** Rebuild the tab's digest from its state and keep it beside the tab; answers it, search text included. */
export async function refreshTextDocumentDigest(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
): Promise<TextDocumentDigest> {
  const started = Date.now();
  const updates = await storedUpdates(env, tabId);
  const digest = textDocumentDigest(TextDocumentState.load(updates));
  const stateBytes = updates.reduce((n, u) => n + u.byteLength, 0);
  await env.DOCUMENT_DB.prepare(
    `INSERT INTO text_document_digest (tab_id, characters, words, pages, has_content, state_bytes, written_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(tab_id) DO UPDATE SET
       characters = excluded.characters,
       words = excluded.words,
       pages = excluded.pages,
       has_content = excluded.has_content,
       state_bytes = excluded.state_bytes,
       written_at = excluded.written_at`,
  )
    .bind(
      tabId,
      digest.characters,
      digest.words,
      digest.pages,
      digest.hasContent ? 1 : 0,
      stateBytes,
      Date.now(),
    )
    .run();
  console.info(
    `[text-document] digest document=${documentId} tab=${tabId} characters=${digest.characters} words=${digest.words} bytes=${stateBytes} ms=${Date.now() - started}`,
  );
  return digest;
}
