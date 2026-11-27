// A room's keeper of its text documents' notification windows (docs/specs/034-text-documents/review.md
// "Notifications", Batches). Before an update is stored on a tab with no open window, it notes what the tab held just
// before (its comments' ids, its state vector and deletions) and opens one; the document's window ends
// TEXT_DOCUMENT_NOTICE_WINDOW_MS after the first, on the room's alarm, when every tab's window is closed at once and
// what is new in them is emailed. Only where email is configured; nothing here ever stands in an edit's way.
import {
  LiveThreads,
  TEXT_DOCUMENT_NOTICE_WINDOW_MS,
  TextDocumentState,
  VersionSnapshots,
  type TextDocumentThread,
} from '@livedoc/text-documents';
import { emailEnabled } from '../email/client';
import type { DocumentEnv } from '../types';
import {
  sendNoticeBatches,
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
          stateVector,
          deletions,
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
      const { results } = await env.DOCUMENT_DB.prepare(
        'DELETE FROM text_document_notice_baselines RETURNING tab_id, comment_ids',
      ).all<{ tab_id: string; comment_ids: string }>();
      const windows = (results ?? []).map((r) => ({
        tabId: r.tab_id,
        commentIds: JSON.parse(r.comment_ids) as string[],
      }));
      if (windows.length === 0 || !documentId) return;
      const send = this.deps.send ?? sendNoticeBatches;
      await send({ env, documentId, threadsOf: (tabId) => this.threadsOf(tabId), now }, windows);
    } catch (error) {
      console.warn(
        `[text-document-notices] send failed doc=${documentId ?? 'unbound'} error=${errorName(error)}`,
      );
    }
  }
}
