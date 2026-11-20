// A text document's limits in its room (docs/specs/034-text-documents/live-editing-and-storage.md "Refused edits"): an
// update that would take it past its characters or its stored state's size is refused whole. Characters are the
// digest's (one drain late) and those the update inserts, deletions not counted, so nothing that should be refused is
// let through; the state is every stored byte.
import {
  TEXT_DOCUMENT_MAX_CHARS,
  TEXT_DOCUMENT_MAX_STATE_BYTES,
  TextDocumentState,
} from '@livedoc/text-documents';
import type { DocumentEnv } from '../types';

export type TextDocumentLimit = 'characters' | 'state';

/** The limits an update is checked against. */
export type TextDocumentCaps = { characters: number; stateBytes: number };

const SPEC_CAPS: TextDocumentCaps = {
  characters: TEXT_DOCUMENT_MAX_CHARS,
  stateBytes: TEXT_DOCUMENT_MAX_STATE_BYTES,
};

/** The limit this update would pass, or null. */
export async function textDocumentLimitOf(
  env: DocumentEnv,
  tabId: string,
  update: Uint8Array,
  caps: TextDocumentCaps = SPEC_CAPS,
): Promise<TextDocumentLimit | null> {
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(LENGTH(bytes)), 0) FROM text_document_chunks WHERE tab_id = ?1)
         + (SELECT COALESCE(SUM(LENGTH(bytes)), 0) FROM text_document_updates WHERE tab_id = ?1) AS bytes,
       (SELECT characters FROM text_document_digest WHERE tab_id = ?1) AS characters`,
  )
    .bind(tabId)
    .first<{ bytes: number; characters: number | null }>();
  if ((row?.bytes ?? 0) + update.byteLength > caps.stateBytes) return 'state';
  const inserted = TextDocumentState.insertedCharacters(update);
  if (inserted > 0 && (row?.characters ?? 0) + inserted > caps.characters) return 'characters';
  return null;
}
