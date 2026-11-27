// A room's keeper of its text documents' notification windows (docs/specs/034-text-documents/review.md
// "Notifications", Batches). Before an update is stored on a tab with no open window, it notes what the tab held just
// before (its comments' ids, its state vector and deletions) and opens one; while it is open, each stored update's
// deletions are kept under its sender, so a removal is told as theirs. The document's window ends
// TEXT_DOCUMENT_NOTICE_WINDOW_MS after the first, on the room's alarm, when every tab's window is closed at once and
// what is new in them is emailed. Only where email is configured; nothing here ever stands in an edit's way.
import type { VersionEditorDto } from '@livedoc/api-schema';
import {
  LiveThreads,
  NoticeChanges,
  TEXT_DOCUMENT_NOTICE_WINDOW_MS,
  TextDocumentState,
  VersionSnapshots,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import { fromBlob, toBlob } from '../db/blob';
import { emailEnabled } from '../email/client';
import type { DocumentEnv } from '../types';
import { TextDocumentAuthors } from './text-document-authors';
import {
  sendNoticeBatches,
  type EditNotice,
  type NoticeSendDeps,
  type NoticeWindow,
} from './text-document-notice-send';

/** When the document's open window ends, kept where the room's alarm reads it after a restart. */
export const NOTICE_WINDOW_ENDS_KEY = 'notices:windowEndsAt';

type Kv = Pick<SyncKvStorage, 'get' | 'put' | 'delete'> | undefined;

export type RoomNoticesDeps = {
  readonly env: DocumentEnv;
  readonly kv: () => Kv;
  /** The room's document; null before it holds one. */
  readonly documentId: () => string | null;
  /** The tab's stored updates. */
  readonly storedUpdates: (tabId: string) => Promise<Uint8Array[]>;
  readonly now?: () => number;
  readonly windowMs?: number;
  readonly send?: (deps: NoticeSendDeps, windows: readonly NoticeWindow[]) => Promise<number>;
};

type BaselineRow = {
  tab_id: string;
  comment_ids: string;
  state_vector: unknown;
  deletions: unknown;
};
type DeletionRow = { tab_id: string; author: string; name: string | null; deletions: unknown };

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

const commentIdsOf = (threads: readonly TextDocumentThread[]): string[] =>
  threads.flatMap((t) => t.comments.map((c) => c.id));

export class RoomTextDocumentNotices {
  private readonly deps: RoomNoticesDeps;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(deps: RoomNoticesDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.windowMs = deps.windowMs ?? TEXT_DOCUMENT_NOTICE_WINDOW_MS;
  }

  private async threadsOf(tabId: string): Promise<TextDocumentThread[]> {
    return LiveThreads.read(TextDocumentState.load(await this.deps.storedUpdates(tabId)));
  }

  /** The writing applied in a window, each change with its author's key and the name they wrote under. */
  private async changesOf(window: NoticeWindow): Promise<EditNotice[]> {
    const { tabId, baseline, deleters } = window;
    const clients = await new TextDocumentAuthors(this.deps.env, this.now).clients(tabId);
    const names = new Map<string, string | null>();
    for (const author of clients.values()) if (author.key) names.set(author.key, author.name);
    for (const d of deleters) if (!names.get(d.key)) names.set(d.key, d.name);
    const doc = TextDocumentState.load(await this.deps.storedUpdates(tabId));
    const changes = NoticeChanges.since(doc, baseline, {
      ofClient: (client) => clients.get(client)?.key ?? null,
      deleters: new Map(deleters.map((d) => [d.key, d.deletions])),
    });
    doc.destroy();
    return changes.map((change) => ({
      tabId,
      kind: change.kind,
      text: change.text,
      authorKey: change.author,
      authorName: (change.author && names.get(change.author)) || null,
    }));
  }

  /** After an update is stored on a tab with an open window: its deletions, kept under its sender. Never throws. */
  async stored(
    place: { documentId: string; tabId: string },
    update: Uint8Array,
    author: VersionEditorDto,
  ): Promise<void> {
    const { env } = this.deps;
    if (!emailEnabled(env) || author.key === null) return;
    try {
      const deletions = VersionSnapshots.deletionsOf(update);
      if (deletions.clients.size === 0) return;
      const db = env.DOCUMENT_DB;
      const open = await db
        .prepare('SELECT 1 AS one FROM text_document_notice_baselines WHERE tab_id = ?')
        .bind(place.tabId)
        .first<{ one: number }>();
      if (!open) return;
      const kept = await db
        .prepare(
          'SELECT deletions FROM text_document_notice_deletions WHERE tab_id = ? AND author = ?',
        )
        .bind(place.tabId, author.key)
        .first<{ deletions: unknown }>();
      const merged = VersionSnapshots.encodeDeletions(
        kept
          ? VersionSnapshots.union([
              VersionSnapshots.decodeDeletions(fromBlob(kept.deletions)),
              deletions,
            ])
          : deletions,
      );
      await db
        .prepare(
          `INSERT INTO text_document_notice_deletions (tab_id, author, name, deletions) VALUES (?, ?, ?, ?)
           ON CONFLICT (tab_id, author) DO UPDATE SET name = excluded.name, deletions = excluded.deletions`,
        )
        .bind(place.tabId, author.key, author.name, toBlob(merged))
        .run();
    } catch (error) {
      console.warn(
        `[text-document-notices] deletions failed doc=${place.documentId} tab=${place.tabId} error=${errorName(error)}`,
      );
    }
  }

  /** Before an update is stored on `tabId`: opens its window when none is open. Never throws. */
  async ready(place: { documentId: string; tabId: string }): Promise<void> {
    const { env } = this.deps;
    if (!emailEnabled(env)) return;
    try {
      const open = await env.DOCUMENT_DB.prepare(
        'SELECT 1 AS one FROM text_document_notice_baselines WHERE tab_id = ?',
      )
        .bind(place.tabId)
        .first<{ one: number }>();
      if (open) return;
      const doc = TextDocumentState.load(await this.deps.storedUpdates(place.tabId));
      const { stateVector, deletions } = VersionSnapshots.stateOf(TextDocumentState.encode(doc));
      const now = this.now();
      await env.DOCUMENT_DB.prepare(
        `INSERT INTO text_document_notice_baselines (tab_id, since, comment_ids, state_vector, deletions)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          place.tabId,
          now,
          JSON.stringify(commentIdsOf(LiveThreads.read(doc))),
          toBlob(stateVector),
          toBlob(deletions),
        )
        .run();
      const kv = this.deps.kv();
      if (kv && typeof kv.get(NOTICE_WINDOW_ENDS_KEY) !== 'number')
        kv.put(NOTICE_WINDOW_ENDS_KEY, now + this.windowMs);
      console.info(
        `[text-document-notices] window opened doc=${place.documentId} tab=${place.tabId}`,
      );
    } catch (error) {
      console.warn(
        `[text-document-notices] window failed doc=${place.documentId} tab=${place.tabId} error=${errorName(error)}`,
      );
    }
  }

  /** When the open window ends, for the room's one alarm; null with none open. */
  deadline(): number | null {
    const at = this.deps.kv()?.get(NOTICE_WINDOW_ENDS_KEY);
    return typeof at === 'number' ? at : null;
  }

  /** From the room's alarm: a window that has ended is closed and emailed. Never throws. */
  async alarm(now: number): Promise<void> {
    const at = this.deadline();
    if (at === null || at > now) return;
    this.deps.kv()?.delete(NOTICE_WINDOW_ENDS_KEY);
    const { env } = this.deps;
    const documentId = this.deps.documentId();
    try {
      // Closed in the one statement that reads them, so a window opened meanwhile is never dropped unread.
      const [closed, deleted] = await env.DOCUMENT_DB.batch([
        env.DOCUMENT_DB.prepare(
          'DELETE FROM text_document_notice_baselines RETURNING tab_id, comment_ids, state_vector, deletions',
        ),
        env.DOCUMENT_DB.prepare(
          'DELETE FROM text_document_notice_deletions RETURNING tab_id, author, name, deletions',
        ),
      ]);
      const deleters = ((deleted?.results ?? []) as DeletionRow[]).map((r) => ({
        tabId: r.tab_id,
        key: r.author,
        name: r.name,
        deletions: fromBlob(r.deletions),
      }));
      const windows = ((closed?.results ?? []) as BaselineRow[]).map((r): NoticeWindow => ({
        tabId: r.tab_id,
        commentIds: JSON.parse(r.comment_ids) as string[],
        baseline: { stateVector: fromBlob(r.state_vector), deletions: fromBlob(r.deletions) },
        deleters: deleters
          .filter((d) => d.tabId === r.tab_id)
          .map(({ key, name, deletions }) => ({ key, name, deletions })),
      }));
      if (windows.length === 0 || !documentId) return;
      const send = this.deps.send ?? sendNoticeBatches;
      await send(
        {
          env,
          documentId,
          threadsOf: (tabId) => this.threadsOf(tabId),
          changesOf: (window) => this.changesOf(window),
          now,
        },
        windows,
      );
    } catch (error) {
      console.warn(
        `[text-document-notices] send failed doc=${documentId ?? 'unbound'} error=${errorName(error)}`,
      );
    }
  }
}
