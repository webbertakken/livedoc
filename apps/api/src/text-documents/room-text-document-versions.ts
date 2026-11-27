// A room's keeper of its text document tabs' versions (docs/specs/034-text-documents/live-editing-and-storage.md
// "Versions"): it records who wrote each stored update, takes an automatic version when a window of edits ends,
// thins, names and restores. Every method runs on the room's write queue; `stored` never throws, so nothing here
// ever stands in an edit's way.
import type { TextDocumentVersionDto, VersionEditorDto } from '@livedoc/api-schema';
import {
  base64OfBytes,
  restoreUpdate,
  TEXT_DOCUMENT_AUTO_VERSIONS_MAX,
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_NAMED_VERSIONS_MAX,
  TEXT_DOCUMENT_SEED_CLIENT,
  TEXT_DOCUMENT_VERSION_EVERY_MS,
  TEXT_DOCUMENT_VERSION_EVERY_UPDATES,
  TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS,
  TEXT_DOCUMENT_VERSIONS_MAX_BYTES,
  VersionSnapshots,
} from '@livedoc/text-documents';
import { fromBlob } from '../db/blob';
import type { DocumentEnv } from '../types';
import { TextDocumentAuthors, type VersionAuthor } from './text-document-authors';
import { TEXT_DOCUMENT_LIVE_TAB } from './text-document-live-tab';
import {
  putVersionStatement,
  rowBytes,
  versionDto,
  versionRows,
  type VersionKind,
  type VersionRow,
} from './text-document-version-rows';
import { thinningStatements } from './version-thinning-apply';

/** Where a version is taken: the document and its text document tab. */
export type VersionPlace = { readonly documentId: string; readonly tabId: string };

export type VersionWriteError = 'version_not_found' | 'named_versions_full';
export type VersionWrite =
  | { readonly ok: true; readonly version: TextDocumentVersionDto }
  | { readonly ok: false; readonly error: VersionWriteError };

/** The window of edits since a tab's last version, kept in the room's memory. */
type VersionWindow = { since: number; updates: number };

export type VersionCaps = {
  readonly everyMs: number;
  readonly everyUpdates: number;
  readonly keepAllDays: number;
  readonly autoMax: number;
  readonly maxBytes: number;
  readonly namedMax: number;
  readonly rowBytes: number;
};

export const VERSION_CAPS: VersionCaps = {
  everyMs: TEXT_DOCUMENT_VERSION_EVERY_MS,
  everyUpdates: TEXT_DOCUMENT_VERSION_EVERY_UPDATES,
  keepAllDays: TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS,
  autoMax: TEXT_DOCUMENT_AUTO_VERSIONS_MAX,
  maxBytes: TEXT_DOCUMENT_VERSIONS_MAX_BYTES,
  namedMax: TEXT_DOCUMENT_NAMED_VERSIONS_MAX,
  rowBytes: TEXT_DOCUMENT_CHUNK_BYTES,
};

export type RoomVersionsDeps = {
  readonly env: DocumentEnv;
  /** The tab's stored updates. */
  readonly storedUpdates: (tabId: string) => Promise<Uint8Array[]>;
  /** Stores one update and relays it to everyone, on the write queue the caller is already on. */
  readonly storeUpdate: (place: VersionPlace, update: Uint8Array) => Promise<void>;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly caps?: VersionCaps;
};

type Taking = {
  readonly kind: VersionKind;
  readonly name?: string | null;
  readonly by?: VersionAuthor | null;
  readonly restoredFrom?: string | null;
  readonly trigger: 'time' | 'updates' | 'named' | 'restore' | 'restored';
};

// An encoded state vector holding nothing: what came before a tab's first version.
const NO_STATE_VECTOR = Uint8Array.of(0);

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

export class RoomTextDocumentVersions {
  private readonly deps: RoomVersionsDeps;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly caps: VersionCaps;
  private readonly authors: TextDocumentAuthors;
  private readonly windows = new Map<string, VersionWindow>();

  constructor(deps: RoomVersionsDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.caps = deps.caps ?? VERSION_CAPS;
    this.authors = new TextDocumentAuthors(deps.env, this.now);
  }

  /** After an update is stored: who wrote it, and a version when its window ends. Never throws. */
  async stored(place: VersionPlace, update: Uint8Array, author: VersionAuthor): Promise<void> {
    const where = `document=${place.documentId} tab=${place.tabId}`;
    try {
      await this.authors.record(place, update, author);
    } catch (error) {
      console.warn(`[text-document] author-record-failed ${where} error=${errorName(error)}`);
    }
    const now = this.now();
    const window = this.windows.get(place.tabId) ?? { since: now, updates: 0 };
    window.updates += 1;
    const trigger =
      window.updates >= this.caps.everyUpdates
        ? 'updates'
        : now - window.since >= this.caps.everyMs
          ? 'time'
          : null;
    if (!trigger) {
      this.windows.set(place.tabId, window);
      return;
    }
    this.windows.delete(place.tabId);
    try {
      await this.take(place, { kind: 'automatic', trigger });
    } catch (error) {
      console.warn(`[text-document] version-failed ${where} error=${errorName(error)}`);
    }
  }

  /** Takes a version of the state now, then thins; null when its row would pass the room's row cap. */
  private async take(place: VersionPlace, taking: Taking): Promise<VersionRow | null> {
    const { env } = this.deps;
    const { tabId } = place;
    const started = this.now();
    const rows = await versionRows(env, tabId);
    const state = TEXT_DOCUMENT_LIVE_TAB.state.merge(await this.deps.storedUpdates(tabId));
    const { stateVector, deletions } = VersionSnapshots.stateOf(state);
    const added = VersionSnapshots.addedBytes(
      deletions,
      rows.map((r) => r.deletions),
    );
    const pending = await this.pendingDeletions(tabId);
    const editors = await this.editorsSince(tabId, rows.at(-1)?.stateVector, stateVector, pending);
    const deletedBy = Object.fromEntries(
      [...pending].map(([key, bytes]) => [key, base64OfBytes(bytes)]),
    );
    const row: VersionRow = {
      tabId,
      seq: (rows.at(-1)?.seq ?? 0) + 1,
      id: this.newId(),
      kind: taking.kind,
      name: taking.name ?? null,
      takenAt: this.now(),
      takenBy: taking.by ?? null,
      restoredFrom: taking.restoredFrom ?? null,
      stateVector,
      deletions: added,
      editors,
      deletedBy,
      bytes: 0,
    };
    const sized = { ...row, bytes: rowBytes(row) };
    const where = `document=${place.documentId} tab=${tabId}`;
    if (sized.bytes > this.caps.rowBytes) {
      console.warn(`[text-document] version-too-large ${where} bytes=${sized.bytes}`);
      return null;
    }
    const thinning = thinningStatements(env, [...rows, sized], this.now(), this.caps, where);
    await env.DOCUMENT_DB.batch([
      putVersionStatement(env, sized),
      env.DOCUMENT_DB.prepare('DELETE FROM text_document_pending_deletions WHERE tab_id = ?').bind(
        tabId,
      ),
      ...thinning,
    ]);
    console.info(
      `[text-document] version-taken ${where} version=${sized.id} kind=${sized.kind} trigger=${taking.trigger} bytes=${sized.bytes} ms=${this.now() - started}`,
    );
    return sized;
  }

  private async pendingDeletions(tabId: string): Promise<Map<string, Uint8Array>> {
    const { results } = await this.deps.env.DOCUMENT_DB.prepare(
      'SELECT author, deletions FROM text_document_pending_deletions WHERE tab_id = ?',
    )
      .bind(tabId)
      .all<{ author: string; deletions: unknown }>();
    return new Map((results ?? []).map((r) => [r.author, fromBlob(r.deletions)]));
  }

  /** Who wrote since the version before: the authors of every client that wrote, and of every pending deletion. */
  private async editorsSince(
    tabId: string,
    before: Uint8Array | undefined,
    after: Uint8Array,
    pending: ReadonlyMap<string, Uint8Array>,
  ): Promise<VersionEditorDto[]> {
    const clients = await this.authors.clients(tabId);
    const wrote = VersionSnapshots.advanced(before ?? NO_STATE_VECTOR, after).filter(
      (client) => client !== TEXT_DOCUMENT_SEED_CLIENT,
    );
    const byKey = new Map<string | null, VersionEditorDto>();
    for (const client of wrote) {
      const author = clients.get(client) ?? { key: null, name: null, color: null };
      if (!byKey.has(author.key)) byKey.set(author.key, author);
    }
    const named = [...clients.values()];
    for (const key of pending.keys())
      if (!byKey.has(key))
        byKey.set(key, named.find((a) => a.key === key) ?? { key, name: null, color: null });
    return [...byKey.values()];
  }

  /** Names one version; an empty name makes it automatic again. */
  async name(
    place: VersionPlace,
    versionId: string,
    name: string | null,
    by: VersionAuthor,
  ): Promise<VersionWrite> {
    const rows = await versionRows(this.deps.env, place.tabId);
    const target = rows.find((r) => r.id === versionId);
    if (!target) return { ok: false, error: 'version_not_found' };
    return this.named(place, rows, target, name, by);
  }

  /** Names the current version: the newest when nothing changed since it, else a version of now. */
  async nameCurrent(
    place: VersionPlace,
    name: string | null,
    by: VersionAuthor,
  ): Promise<VersionWrite> {
    const rows = await versionRows(this.deps.env, place.tabId);
    const state = TEXT_DOCUMENT_LIVE_TAB.state.merge(await this.deps.storedUpdates(place.tabId));
    const newest = rows.at(-1);
    const now = VersionSnapshots.stateOf(state).stateVector;
    const current = newest && VersionSnapshots.sameState(newest.stateVector, now) ? newest : null;
    return this.named(place, rows, current, name, by);
  }

  private async named(
    place: VersionPlace,
    rows: readonly VersionRow[],
    target: VersionRow | null,
    name: string | null,
    by: VersionAuthor,
  ): Promise<VersionWrite> {
    const { env } = this.deps;
    const named = rows.filter((r) => r.kind === 'named').length;
    if (name !== null && target?.kind !== 'named' && named >= this.caps.namedMax)
      return { ok: false, error: 'named_versions_full' };
    const where = `document=${place.documentId} tab=${place.tabId}`;
    if (!target) {
      // Nothing to unname: the current version has no version yet.
      if (name === null) return { ok: false, error: 'version_not_found' };
      const taken = await this.take(place, { kind: 'named', name, by, trigger: 'named' });
      if (!taken) return { ok: false, error: 'version_not_found' };
      console.info(`[text-document] version-named ${where} version=${taken.id}`);
      return { ok: true, version: versionDto(taken) };
    }
    const renamed: VersionRow = { ...target, kind: name === null ? 'automatic' : 'named', name };
    await env.DOCUMENT_DB.batch([putVersionStatement(env, renamed)]);
    console.info(`[text-document] version-named ${where} version=${renamed.id}`);
    return { ok: true, version: versionDto(renamed) };
  }

  /**
   * Restores a version: an automatic version of now first, then one change by the restorer that makes the document
   * read as it, stored and relayed, then a version of the result, restored from it.
   */
  async restore(place: VersionPlace, versionId: string, by: VersionAuthor): Promise<VersionWrite> {
    const { env } = this.deps;
    const started = this.now();
    const rows = await versionRows(env, place.tabId);
    const index = rows.findIndex((r) => r.id === versionId);
    if (index < 0) return { ok: false, error: 'version_not_found' };
    // Read before a version of now is taken, whose thinning may let an old automatic one go.
    const snapshot = VersionSnapshots.encodedSnapshotOf(
      rows[index]!.stateVector,
      rows.slice(0, index + 1).map((r) => r.deletions),
    );
    const stored = await this.deps.storedUpdates(place.tabId);
    const state = TEXT_DOCUMENT_LIVE_TAB.state.merge(stored);
    const newest = rows.at(-1)!;
    if (
      !VersionSnapshots.sameState(newest.stateVector, VersionSnapshots.stateOf(state).stateVector)
    )
      await this.take(place, { kind: 'automatic', trigger: 'restore' });
    const update = restoreUpdate(stored, snapshot);
    const where = `document=${place.documentId} tab=${place.tabId}`;
    if (!update) {
      // The document already reads as the version: nothing to change, nothing more to keep.
      const current = (await versionRows(env, place.tabId)).at(-1)!;
      console.info(
        `[text-document] version-restored ${where} from=${versionId} to=${current.id} bytes=0 ms=${this.now() - started}`,
      );
      return { ok: true, version: versionDto(current) };
    }
    await this.deps.storeUpdate(place, update);
    await this.authors.record(place, update, by).catch((error: unknown) => {
      console.warn(`[text-document] author-record-failed ${where} error=${errorName(error)}`);
    });
    const result = await this.take(place, {
      kind: 'automatic',
      by,
      restoredFrom: versionId,
      trigger: 'restored',
    });
    this.windows.delete(place.tabId);
    const answered = result ?? (await versionRows(env, place.tabId)).at(-1)!;
    console.info(
      `[text-document] version-restored ${where} from=${versionId} to=${answered.id} bytes=${update.byteLength} ms=${this.now() - started}`,
    );
    return { ok: true, version: versionDto(answered) };
  }
}
