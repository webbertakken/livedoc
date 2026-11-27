// A room's keeper of its Viewers' copies of its text document tabs (docs/specs/034-text-documents/review.md "What a
// Viewer receives"; live-editing-and-storage.md "A Viewer's copy"). A Viewer receives no thread and nothing of who
// suggested what, so each tab a Viewer reads gets a copy without them (`ViewerCopy`), made from the stored state, kept
// in the room's SQLite as its own log so a room waking from hibernation takes the same copy up again, and let go with
// the room's last Viewer. Every method but `dropIdle` runs on the room's write queue, so a copy and the stored updates
// after it never cross. A copy let go while Viewers are connected ends their connections: their editors hold it.
import {
  base64OfBytes,
  bytesOfBase64,
  TEXT_DOCUMENT_FRAME_CHARS,
  TextDocumentState,
  VIEWER_COPY_LOG_UPDATES,
  VIEWER_COPY_SOURCE_MAX_BYTES,
  VIEWER_COPY_STATE_MAX_BYTES,
  ViewerCopy,
} from '@livedoc/text-documents';
import { fromBlob, toBlob } from '../db/blob';
import type { DocumentEnv } from '../types';

/** Where a copy is kept: the document and its text document tab. */
export type ViewerCopyPlace = { readonly documentId: string; readonly tabId: string };

/** What a Viewer's state door answers: the copy's state (or what it holds beyond `since`), its vector and its id. */
export type ViewerCopyState =
  | {
      readonly ok: true;
      readonly state: Uint8Array;
      readonly vector: Uint8Array;
      readonly id: string;
    }
  | { readonly ok: false; readonly error: 'viewer_copy_unavailable' | 'viewer_copy_changed' };

/** The op a Viewer receives for a stored update: what the copy gained, or the tab's `stale` when it is too large. */
export type ViewerCopyOp =
  | { kind: 'text-document'; tabId: string; update: string; viewerCopy: string }
  | { kind: 'text-document'; tabId: string; stale: true };

export type ViewerCopyLimits = {
  readonly sourceMaxBytes: number;
  readonly stateMaxBytes: number;
  readonly logUpdates: number;
  readonly frameChars: number;
};

export const VIEWER_COPY_LIMITS: ViewerCopyLimits = {
  sourceMaxBytes: VIEWER_COPY_SOURCE_MAX_BYTES,
  stateMaxBytes: VIEWER_COPY_STATE_MAX_BYTES,
  logUpdates: VIEWER_COPY_LOG_UPDATES,
  frameChars: TEXT_DOCUMENT_FRAME_CHARS,
};

export type RoomViewerCopiesDeps = {
  readonly env: DocumentEnv;
  /** The tab's stored updates. */
  readonly storedUpdates: (tabId: string) => Promise<Uint8Array[]>;
  /** Whether a Viewer is connected to the room, but for one leaving it. */
  readonly hasViewers: (leaving?: unknown) => boolean;
  /** Ends every Viewer's connection: they read a copy that is gone. Answers how many. */
  readonly closeViewers: () => number;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly limits?: ViewerCopyLimits;
};

type Held = { readonly copy: ViewerCopy; readonly id: string };

/** Why a copy could not be had: kept as the log's reason. */
type Unavailable = 'too-large' | 'failed';

const COPIES = 'text_document_viewer_copies';
const UPDATES = 'text_document_viewer_copy_updates';

export class RoomViewerCopies {
  private readonly deps: RoomViewerCopiesDeps;
  private readonly limits: ViewerCopyLimits;
  private readonly held = new Map<string, Held>();

  constructor(deps: RoomViewerCopiesDeps) {
    this.deps = deps;
    this.limits = deps.limits ?? VIEWER_COPY_LIMITS;
  }

  /** A Viewer's read of a tab's state: from its copy, made when there is none; refused when it cannot be had. */
  async state(place: ViewerCopyPlace, reader?: ViewerCopyReader): Promise<ViewerCopyState> {
    const held = await this.ensure(place, true);
    if (held === null || typeof held === 'string')
      return { ok: false, error: 'viewer_copy_unavailable' };
    const vector = TextDocumentState.stateVectorOf(held.copy.state());
    // A catch-up from another copy than this one: what it holds was written by a client this copy never had.
    if (reader && reader.copy !== held.id) {
      console.warn(
        `[viewer-copy] refused document=${place.documentId} tab=${place.tabId} since=another-copy`,
      );
      return { ok: false, error: 'viewer_copy_changed' };
    }
    return { ok: true, state: held.copy.state(reader?.vector), vector, id: held.id };
  }

  /**
   * Run before a stored update of the tab: a copy the room kept is taken up again while the state is still the one it
   * was copied from, so the update that follows is copied over as any other.
   */
  async ready(place: ViewerCopyPlace): Promise<void> {
    if (!this.deps.hasViewers()) return;
    await this.ensure(place, false);
  }

  /** One stored update copied over: the op Viewers receive, or null when nothing of it reaches them. */
  async relay(place: ViewerCopyPlace, update: Uint8Array): Promise<ViewerCopyOp | null> {
    const held = this.held.get(place.tabId);
    if (!held) return null;
    let gained: Uint8Array | null;
    try {
      gained = held.copy.apply(update);
      if (!gained) return null;
      await this.keep(place, held, gained);
    } catch (error) {
      await this.letGo(place, 'failed', String(error));
      return null;
    }
    if (!this.held.has(place.tabId)) return null;
    const encoded = base64OfBytes(gained);
    return encoded.length <= this.limits.frameChars
      ? { kind: 'text-document', tabId: place.tabId, update: encoded, viewerCopy: held.id }
      : { kind: 'text-document', tabId: place.tabId, stale: true };
  }

  /** The room's last Viewer left: every copy goes, with its rows. Never throws: a socket's close waits on nothing. */
  async dropIdle(documentId: string | null, leaving?: unknown): Promise<void> {
    if (this.deps.hasViewers(leaving)) return;
    const tabs = this.held.size;
    for (const held of this.held.values()) held.copy.destroy();
    this.held.clear();
    try {
      await this.deps.env.DOCUMENT_DB.batch([
        this.deps.env.DOCUMENT_DB.prepare(`DELETE FROM ${UPDATES}`),
        this.deps.env.DOCUMENT_DB.prepare(`DELETE FROM ${COPIES}`),
      ]);
      console.info(`[viewer-copy] dropped document=${documentId ?? '-'} tabs=${tabs} reason=idle`);
    } catch (error) {
      console.warn(
        `[viewer-copy] failed document=${documentId ?? '-'} reason=drop error=${String(error)}`,
      );
    }
  }

  /** The tab's copy: held, taken up again from what the room kept, or (when `make`) made from the stored state. */
  private async ensure(place: ViewerCopyPlace, make: boolean): Promise<Held | Unavailable | null> {
    const held = this.held.get(place.tabId);
    if (held) return held;
    let kept: Awaited<ReturnType<RoomViewerCopies['kept']>>;
    let updates: Uint8Array[];
    try {
      kept = await this.kept(place.tabId);
      if (!kept && !make) return null;
      updates = await this.deps.storedUpdates(place.tabId);
    } catch (error) {
      this.failed(place, 'read', String(error));
      return 'failed';
    }
    const bytes = updates.reduce((n, u) => n + u.byteLength, 0);
    if (bytes > this.limits.sourceMaxBytes) {
      if (kept) await this.letGo(place, 'too-large', `source=${bytes}`);
      else this.failed(place, 'too-large', `source=${bytes}`);
      return 'too-large';
    }
    if (kept) {
      const restored = await this.restore(place, kept, updates);
      if (restored) return restored;
      if (!make) return null;
    }
    return this.make(place, updates);
  }

  private async restore(
    place: ViewerCopyPlace,
    kept: { id: string; client: number; updates: Uint8Array[] },
    updates: Uint8Array[],
  ): Promise<Held | null> {
    const started = Date.now();
    try {
      const { copy, caughtUp } = ViewerCopy.restore(updates, kept.updates, kept.client);
      const held = { copy, id: kept.id };
      this.held.set(place.tabId, held);
      if (caughtUp) {
        // The copy lagged the state (the room stopped between storing an update and copying it): its Viewers read
        // again, from what it holds now.
        await this.keep(place, held, caughtUp);
        this.deps.closeViewers();
      }
      console.info(
        `[viewer-copy] restored document=${place.documentId} tab=${place.tabId} updates=${kept.updates.length} caught-up=${caughtUp !== null} ms=${Date.now() - started}`,
      );
      return held;
    } catch (error) {
      await this.letGo(place, 'failed', `restore ${String(error)}`);
      return null;
    }
  }

  private async make(place: ViewerCopyPlace, updates: Uint8Array[]): Promise<Held | Unavailable> {
    const started = Date.now();
    let copy: ViewerCopy;
    try {
      copy = ViewerCopy.build(updates);
    } catch (error) {
      this.failed(place, 'build', String(error));
      return 'failed';
    }
    const state = copy.state();
    if (state.byteLength > this.limits.stateMaxBytes) {
      copy.destroy();
      this.failed(place, 'too-large', `state=${state.byteLength}`);
      return 'too-large';
    }
    const held = { copy, id: this.deps.newId?.() ?? crypto.randomUUID() };
    const db = this.deps.env.DOCUMENT_DB;
    try {
      await db.batch([
        db.prepare(`DELETE FROM ${UPDATES} WHERE tab_id = ?`).bind(place.tabId),
        db
          .prepare(
            `INSERT OR REPLACE INTO ${COPIES} (tab_id, id, client, made_at) VALUES (?, ?, ?, ?)`,
          )
          .bind(place.tabId, held.id, copy.client, this.deps.now?.() ?? Date.now()),
        db
          .prepare(`INSERT INTO ${UPDATES} (tab_id, seq, bytes) VALUES (?, 1, ?)`)
          .bind(place.tabId, toBlob(state)),
      ]);
    } catch (error) {
      copy.destroy();
      this.failed(place, 'keep', String(error));
      return 'failed';
    }
    this.held.set(place.tabId, held);
    console.info(
      `[viewer-copy] built document=${place.documentId} tab=${place.tabId} bytes=${state.byteLength} ms=${Date.now() - started}`,
    );
    return held;
  }

  /** What the room kept of a tab's copy, or null. */
  private async kept(
    tabId: string,
  ): Promise<{ id: string; client: number; updates: Uint8Array[] } | null> {
    const db = this.deps.env.DOCUMENT_DB;
    const copy = await db
      .prepare(`SELECT id, client FROM ${COPIES} WHERE tab_id = ?`)
      .bind(tabId)
      .first<{ id: string; client: number }>();
    if (!copy) return null;
    const log = await db
      .prepare(`SELECT bytes FROM ${UPDATES} WHERE tab_id = ? ORDER BY seq`)
      .bind(tabId)
      .all<{ bytes: unknown }>();
    const updates = log.results.map((r) => fromBlob(r.bytes));
    return { id: copy.id, client: copy.client, updates };
  }

  /** What a copy gained, kept; past the log's length the log becomes one row, and a copy past its size is let go. */
  private async keep(place: ViewerCopyPlace, held: Held, gained: Uint8Array): Promise<void> {
    const db = this.deps.env.DOCUMENT_DB;
    await db
      .prepare(
        `INSERT INTO ${UPDATES} (tab_id, seq, bytes)
         VALUES (?, COALESCE((SELECT MAX(seq) FROM ${UPDATES} WHERE tab_id = ?), 0) + 1, ?)`,
      )
      .bind(place.tabId, place.tabId, toBlob(gained))
      .run();
    const size = await db
      .prepare(`SELECT COUNT(*) AS updates FROM ${UPDATES} WHERE tab_id = ?`)
      .bind(place.tabId)
      .all<{ updates: number }>();
    if (size.results[0]!.updates <= this.limits.logUpdates) return;
    const state = held.copy.state();
    if (state.byteLength > this.limits.stateMaxBytes) {
      await this.letGo(place, 'too-large', `state=${state.byteLength}`);
      return;
    }
    await db.batch([
      db.prepare(`DELETE FROM ${UPDATES} WHERE tab_id = ?`).bind(place.tabId),
      db
        .prepare(`INSERT INTO ${UPDATES} (tab_id, seq, bytes) VALUES (?, 1, ?)`)
        .bind(place.tabId, toBlob(state)),
    ]);
    console.info(
      `[viewer-copy] compacted document=${place.documentId} tab=${place.tabId} bytes=${state.byteLength}`,
    );
  }

  /** A copy let go while Viewers may hold it: its rows deleted and every Viewer's connection ended. */
  private async letGo(place: ViewerCopyPlace, reason: Unavailable, detail: string): Promise<void> {
    this.held.get(place.tabId)?.copy.destroy();
    this.held.delete(place.tabId);
    try {
      const db = this.deps.env.DOCUMENT_DB;
      await db.batch([
        db.prepare(`DELETE FROM ${UPDATES} WHERE tab_id = ?`).bind(place.tabId),
        db.prepare(`DELETE FROM ${COPIES} WHERE tab_id = ?`).bind(place.tabId),
      ]);
    } catch (error) {
      console.warn(
        `[viewer-copy] failed document=${place.documentId} tab=${place.tabId} reason=drop error=${String(error)}`,
      );
    }
    const closed = this.deps.closeViewers();
    console.warn(
      `[viewer-copy] dropped document=${place.documentId} tab=${place.tabId} reason=${reason} closed=${closed} ${detail}`,
    );
  }

  private failed(place: ViewerCopyPlace, reason: string, detail: string): void {
    console.warn(
      `[viewer-copy] failed document=${place.documentId} tab=${place.tabId} reason=${reason} ${detail}`,
    );
  }
}

/** A Viewer catching up: the copy it holds (null when it names none), and its state vector when it fits the read. */
export type ViewerCopyReader = { readonly vector?: Uint8Array; readonly copy: string | null };

/** A Viewer's state read as the room is asked it: the place, and the reader when it catches up. */
export type ViewerCopyRead = {
  readonly place: ViewerCopyPlace;
  readonly reader?: ViewerCopyReader;
};

/**
 * The body of a Viewer's state read, or null when it is not one: `since` (base64, as the door took it) and `copy` make
 * it a catch-up, either alone.
 */
export function parseViewerCopyRead(body: unknown): ViewerCopyRead | null {
  if (typeof body !== 'object' || body === null) return null;
  const { documentId, tabId, since, copy } = body as Record<string, unknown>;
  if (typeof documentId !== 'string' || typeof tabId !== 'string') return null;
  const place = { documentId, tabId };
  if (since === undefined && copy === undefined) return { place };
  const named = typeof copy === 'string' ? copy : null;
  if (since === undefined) return { place, reader: { copy: named } };
  const vector = typeof since === 'string' ? bytesOfBase64(since) : null;
  if (!vector) return null;
  return { place, reader: { vector, copy: named } };
}

/**
 * A stored state as a Viewer may hold it, for a door that answers once (a Viewer's file, a Viewer's copy of the
 * document): null when it is past the copy's limits or cannot be copied, which the door answers as unavailable.
 */
export function viewerStateOf(
  state: Uint8Array,
  where: ViewerCopyPlace,
  limits: ViewerCopyLimits = VIEWER_COPY_LIMITS,
): Uint8Array | null {
  const tag = `document=${where.documentId} tab=${where.tabId}`;
  if (state.byteLength > limits.sourceMaxBytes) {
    console.warn(`[viewer-copy] failed ${tag} reason=too-large source=${state.byteLength}`);
    return null;
  }
  try {
    return ViewerCopy.redacted([state]);
  } catch (error) {
    console.warn(`[viewer-copy] failed ${tag} reason=build ${String(error)}`);
    return null;
  }
}
