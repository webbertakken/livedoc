// The key-value room each document had before its content moved into a SQLite room
// (docs/specs/006-document/document-storage-move.md "The rooms change class",
// docs/specs/006-document/document-storage-move.md). A Durable Object class cannot change its storage
// backend, so the old class is renamed aside as this one; it only hands its storage to the document's new room and
// then clears it. The release that drops D1's content tables deletes the class.

import { DurableObject } from 'cloudflare:workers';
import { json } from '../responses';

/** Keys one `exportState` page carries. */
export const LEGACY_PAGE_KEYS = 512;

export type LegacyStatePage = { entries: [string, unknown][]; next: string | null };

export class LegacyDocumentRoom extends DurableObject<unknown> {
  /** One page of every key the room stores, in key order, after `cursor`; `next` is null on the last page. */
  async exportState(cursor: string | null): Promise<LegacyStatePage> {
    const page = await this.ctx.storage.list({
      ...(cursor === null ? {} : { startAfter: cursor }),
      limit: LEGACY_PAGE_KEYS,
    });
    const entries = [...page.entries()];
    const next = entries.length === LEGACY_PAGE_KEYS ? entries.at(-1)![0] : null;
    return { entries, next };
  }

  /** Delete everything the room stores, once its document's move is recorded. */
  async clear(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** No socket or request reaches a legacy room any more: the binding names the new class. */
  override async fetch(_request: Request): Promise<Response> {
    return json({ error: 'room_moved' }, { status: 410 });
  }
}
