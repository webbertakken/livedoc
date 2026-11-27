// Who changed what in a text document tab (docs/specs/034-text-documents/live-editing-and-storage.md "Who changed
// what"): each Yjs client id an update writes with, under its sender's adder key and the name and colour they wrote
// under, the first sender keeping it; and the deletions each sender made since the last version, which the next version
// takes. Written after the update is stored, never in its way: the caller logs a failure and the edit stands.
import type { VersionEditorDto } from '@livedoc/api-schema';
import { VersionSnapshots } from '@livedoc/text-documents';
import { fromBlob, toBlob } from '../db/blob';
import type { DocumentEnv } from '../types';

/** The sender of an update as the room knows them: their key (null: none), and their presence's name and colour. */
export type VersionAuthor = VersionEditorDto;

type ClientRow = { client: number; author: string; name: string | null; color: string | null };

export class TextDocumentAuthors {
  private readonly env: DocumentEnv;
  private readonly now: () => number;
  // Each tab's client ids to their author's key, read once a room's life.
  private readonly known = new Map<string, Map<number, string>>();

  constructor(env: DocumentEnv, now: () => number) {
    this.env = env;
    this.now = now;
  }

  private async knownOf(tabId: string): Promise<Map<number, string>> {
    const cached = this.known.get(tabId);
    if (cached) return cached;
    const rows = await this.clientRows(tabId);
    const known = new Map(rows.map((r) => [r.client, r.author]));
    this.known.set(tabId, known);
    return known;
  }

  private async clientRows(tabId: string): Promise<ClientRow[]> {
    const { results } = await this.env.DOCUMENT_DB.prepare(
      'SELECT client, author, name, color FROM text_document_clients WHERE tab_id = ?',
    )
      .bind(tabId)
      .all<ClientRow>();
    return results ?? [];
  }

  /** Records who wrote an update: its new client ids, and its deletions under its sender's key. A sender with no key
   *  is recorded as none. */
  async record(
    where: { documentId: string; tabId: string },
    update: Uint8Array,
    author: VersionAuthor,
  ): Promise<void> {
    const { key } = author;
    if (key === null) return;
    const { tabId } = where;
    const { clients, deletions } = VersionSnapshots.writtenBy(update);
    const known = await this.knownOf(tabId);
    const db = this.env.DOCUMENT_DB;
    const statements: D1PreparedStatement[] = [];
    for (const client of clients) {
      const owner = known.get(client);
      if (owner === undefined)
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO text_document_clients (tab_id, client, author, name, color, first_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(tabId, client, key, author.name, author.color, this.now()),
        );
      else if (owner !== key)
        console.warn(
          `[text-document] author-conflict document=${where.documentId} tab=${tabId} client=${client}`,
        );
    }
    if (deletions.clients.size > 0) {
      const pending = await db
        .prepare(
          'SELECT deletions FROM text_document_pending_deletions WHERE tab_id = ? AND author = ?',
        )
        .bind(tabId, key)
        .first<{ deletions: unknown }>();
      const merged = pending
        ? VersionSnapshots.union([
            VersionSnapshots.decodeDeletions(fromBlob(pending.deletions)),
            deletions,
          ])
        : deletions;
      statements.push(
        db
          .prepare(
            `INSERT INTO text_document_pending_deletions (tab_id, author, deletions) VALUES (?, ?, ?)
             ON CONFLICT (tab_id, author) DO UPDATE SET deletions = excluded.deletions`,
          )
          .bind(tabId, key, toBlob(VersionSnapshots.encodeDeletions(merged))),
      );
    }
    if (statements.length > 0) await db.batch(statements);
    for (const client of clients) if (!known.has(client)) known.set(client, key);
  }

  /** Every client id's author, by client id. */
  async clients(tabId: string): Promise<Map<number, VersionAuthor>> {
    const rows = await this.clientRows(tabId);
    return new Map(rows.map((r) => [r.client, { key: r.author, name: r.name, color: r.color }]));
  }
}
