// A live tab's limits in its room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): an update that
// would take it past its characters or its stored state's size is refused whole. Characters are the digest's (one
// drain late) and those the update inserts, deletions not counted, so nothing that should be refused is let through;
// the state is every stored byte.
import type { DocumentEnv } from '../types';
import type { LiveTabCaps, LiveTabKind, LiveTabLimit } from './live-tab-kind';

/** The limit this update would pass, or null. */
export async function liveTabLimitOf(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  update: Uint8Array,
  caps: LiveTabCaps = kind.caps,
): Promise<LiveTabLimit | null> {
  const { chunks, updates, digest } = kind.tables;
  const row = await env.DOCUMENT_DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(LENGTH(bytes)), 0) FROM ${chunks} WHERE tab_id = ?1)
         + (SELECT COALESCE(SUM(LENGTH(bytes)), 0) FROM ${updates} WHERE tab_id = ?1) AS bytes,
       (SELECT characters FROM ${digest} WHERE tab_id = ?1) AS characters`,
  )
    .bind(tabId)
    .first<{ bytes: number; characters: number | null }>();
  if ((row?.bytes ?? 0) + update.byteLength > caps.stateBytes) return 'state';
  const inserted = kind.state.insertedCharacters(update);
  if (inserted > 0 && (row?.characters ?? 0) + inserted > caps.characters) return 'characters';
  return null;
}
