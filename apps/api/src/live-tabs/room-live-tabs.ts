// A live tab kind's edits in its room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): the room is
// the one writer. Each frame of the kind is checked (its tab is of the kind and in this document, its update decodes,
// no limit is passed), appended to the tab's log on the room's write queue, and only then sequenced to everyone else,
// so nothing relayed is unstored. Updates commute, so the order the queue keeps is for storage, not for merging.
// An Editor's update is stored as it is; anyone else's is judged by what it changes ("The level an update asks").
// A kind whose state stands on something its tab's row names refuses a frame made on anything else, and may have
// the state replaced together with its row ("Replacing a state with its row").
import {
  isRoomOpRef,
  type AccessLevel,
  type LiveTabRefusalName,
  type ServerMessage,
} from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents';
import { isTabRevStale, tabWriteStatements } from '../db/tabs';
import { imageRefAddStatements } from '../db/image-refs';
import type { DocumentEnv } from '../types';
import type { LiveTabCaps, LiveTabKind, LiveTabLimit } from './live-tab-kind';
import { liveTabLimitOf } from './live-tab-limits';
import {
  appendLiveTabUpdate,
  compactionDue,
  compactLiveTab,
  replaceStateStatements,
  storedLiveTab,
  storedLiveTabRow,
  storedUpdates,
} from './live-tab-store';

export type RoomLiveTabHooks = {
  env: DocumentEnv | undefined;
  enqueue: <T>(step: () => Promise<T>) => Promise<T>;
  sequence: (from: string, op: unknown, except?: WebSocket) => number;
  sendTo: (ws: WebSocket, payload: ServerMessage) => void;
  position: () => { epoch: string };
  // The limits checked; the kind's unless a test sizes them.
  caps?: LiveTabCaps;
};

export type LiveTabSender = {
  ws: WebSocket;
  presenceId: string;
  documentId: string | null;
  // The sender's server-verified level, never what a frame claims.
  level: AccessLevel;
  // The adder key its ticket carries (share-roles.md "Integrity"), none without an identity: what a kind's judge reads
  // as the sender's own.
  adderKey: string | null;
};

type LiveTabFrame = { kind: string; tabId: string; update: string; on?: string };

// How often a replacement reads the tab's row again when a save moved it in between.
const REPLACE_ATTEMPTS = 3;

/** Why a frame was refused, for the log's fingerprint. */
export type LiveTabRefusal =
  'shape' | 'decode' | 'wrong-kind' | 'no-store' | 'unreadable' | 'stands-elsewhere';

/**
 * Why an update that reached a tab of the kind was kept out: its sender's level asks more, it changes what is not its
 * sender's own, it cannot be read yet, or it was made on something the tab's row no longer names.
 */
type StandingRefusal = 'level' | 'not-yours' | 'unreadable' | 'stands-elsewhere';

/** What became of an update sent by the door: stored (and relayed), or why it was refused. */
export type PostedOutcome =
  'stored' | 'level' | 'not-yours' | Exclude<LiveTabRefusal, 'shape'> | LiveTabLimit;

/** What a standing refusal told to its sender is named. */
const REFUSAL_NAMES: Record<Exclude<StandingRefusal, 'unreadable'>, LiveTabRefusalName> = {
  level: 'level_too_low',
  'not-yours': 'not_your_mark',
  'stands-elsewhere': 'stored_file_changed',
};

/** The frame, when the op is one of the kind's; else null. */
export function liveTabFrameOf(kind: LiveTabKind, op: unknown): LiveTabFrame | null {
  if (typeof op !== 'object' || op === null) return null;
  const frame = op as { kind?: unknown; tabId?: unknown; update?: unknown; on?: unknown };
  if (frame.kind !== kind.frame) return null;
  if (typeof frame.tabId !== 'string' || typeof frame.update !== 'string') return null;
  // What the frame says it was made on rides along to everyone, as sent.
  const on = typeof frame.on === 'string' ? { on: frame.on } : {};
  return { kind: kind.frame, tabId: frame.tabId, update: frame.update, ...on };
}

export class RoomLiveTabs {
  private readonly kind: LiveTabKind;
  private readonly hooks: RoomLiveTabHooks;

  constructor(kind: LiveTabKind, hooks: RoomLiveTabHooks) {
    this.kind = kind;
    this.hooks = hooks;
  }

  private refused(documentId: string | null, tabId: string | null, reason: LiveTabRefusal): void {
    console.warn(
      `${this.kind.tag} update-refused document=${documentId ?? 'unbound'} tab=${tabId ?? '-'} reason=${reason}`,
    );
  }

  private refusedEdit(documentId: string, tabId: string, limit: LiveTabLimit): void {
    console.warn(
      `${this.kind.tag} edit-refused document=${documentId} tab=${tabId} limit=${limit}`,
    );
  }

  /**
   * Whether this update is kept out of a tab of the kind. One made on anything but what the tab's row names is
   * refused first. Then the sender's level: an Editor's is never read; a Viewer's is refused unread; a
   * Participant's is judged by what the kind says it asks.
   */
  private async standingRefusal(
    env: DocumentEnv,
    where: { documentId: string; tabId: string; tab: Record<string, unknown> },
    sent: {
      update: Uint8Array;
      on: string | undefined;
      level: AccessLevel;
      adderKey: string | null;
    },
  ): Promise<StandingRefusal | null> {
    const { kind } = this;
    const { documentId, tabId, tab } = where;
    const { update, level, adderKey } = sent;
    if (kind.standsOn && sent.on !== (kind.standsOn(tab) ?? undefined)) {
      this.refused(documentId, tabId, 'stands-elsewhere');
      return 'stands-elsewhere';
    }
    if (level === 'edit') return null;
    const reads = level === 'participate' ? kind.state.asks : undefined;
    const asks = reads
      ? reads(await storedUpdates(env, kind, tabId), update, tab, { adderKey })
      : 'edit';
    if (asks === 'participate') return null;
    if (asks === 'unreadable') {
      this.refused(documentId, tabId, 'unreadable');
      return 'unreadable';
    }
    console.warn(
      `${kind.tag} level-refused document=${documentId} tab=${tabId} level=${level} asks=${asks}`,
    );
    return asks === 'not_your_mark' ? 'not-yours' : 'level';
  }

  /** One op from the room to one socket. */
  private tell(ws: WebSocket, op: Record<string, unknown>): void {
    this.hooks.sendTo(ws, { kind: 'op', from: 'system', op });
  }

  /**
   * One replacement of a tab's state with its row ("Replacing a state with its row"), asked from a socket: judged by
   * the kind, written in one transaction at the revision the row was read at, then told to everyone, the sender too.
   * A refusal is told to the sender alone, and nothing is written.
   */
  async replace(sender: LiveTabSender, op: unknown, ref?: unknown): Promise<boolean> {
    const { kind } = this;
    const replace = kind.replace;
    const tabId = replace?.tabIdOf(op) ?? null;
    if (!replace || tabId === null) {
      this.refused(sender.documentId, null, 'shape');
      return false;
    }
    const { env } = this.hooks;
    const documentId = sender.documentId;
    if (!env || !documentId) {
      this.refused(documentId, tabId, 'no-store');
      return false;
    }
    const where = `document=${documentId} tab=${tabId}`;
    return this.hooks.enqueue(async () => {
      for (let attempt = 1; ; attempt += 1) {
        const row = await storedLiveTabRow(env, kind, documentId, tabId);
        if (!row) {
          this.refused(documentId, tabId, 'wrong-kind');
          return false;
        }
        const now = Date.now();
        const judged = await replace.judge({
          env,
          documentId,
          tabId,
          op,
          tab: row.body,
          stored: await storedUpdates(env, kind, tabId),
          level: sender.level,
          now,
        });
        if ('refusal' in judged) {
          console.warn(`${kind.tag} replacement-refused ${where} name=${judged.refusal}`);
          this.tell(sender.ws, {
            kind: `${kind.frame}-refused`,
            tabId,
            name: judged.refusal,
            replacement: true,
          });
          return false;
        }
        const tab = { ...judged.tab, id: tabId, name: row.name } as unknown as Tab;
        try {
          await env.DOCUMENT_DB.batch([
            // The row first: its revision trigger aborts the whole batch when a save moved the tab since it was read.
            ...tabWriteStatements(env, documentId, tab, row.orderIndex, { expected: row.rev }, now),
            ...replaceStateStatements(env, kind, tabId, judged.state, now),
            ...judged.statements,
          ]);
        } catch (error) {
          if (!isTabRevStale(error) || attempt >= REPLACE_ATTEMPTS) throw error;
          continue;
        }
        let seq = 0;
        for (const told of judged.told) seq = this.hooks.sequence('system', told);
        const echo = isRoomOpRef(ref) ? { ref } : {};
        this.hooks.sendTo(sender.ws, {
          kind: 'cursor',
          epoch: this.hooks.position().epoch,
          seq,
          ...echo,
        });
        console.info(`${kind.tag} ${judged.log} ${where}`);
        return true;
      }
    });
  }

  /** One frame of the kind from a socket: stored, then relayed; refused and logged otherwise. */
  async accept(sender: LiveTabSender, op: unknown, ref?: unknown): Promise<boolean> {
    const { kind } = this;
    const frame = liveTabFrameOf(kind, op);
    if (!frame) {
      this.refused(sender.documentId, null, 'shape');
      return false;
    }
    const update = bytesOfBase64(frame.update);
    if (!update || !kind.state.decodes(update)) {
      this.refused(sender.documentId, frame.tabId, 'decode');
      return false;
    }
    const { env } = this.hooks;
    const documentId = sender.documentId;
    if (!env || !documentId) {
      this.refused(documentId, frame.tabId, 'no-store');
      return false;
    }
    return this.hooks.enqueue(async () => {
      const tab = await storedLiveTab(env, kind, documentId, frame.tabId);
      if (!tab) {
        this.refused(documentId, frame.tabId, 'wrong-kind');
        return false;
      }
      const where = { documentId, tabId: frame.tabId, tab };
      const sent = { update, on: frame.on, level: sender.level, adderKey: sender.adderKey };
      const standing = await this.standingRefusal(env, where, sent);
      if (standing) {
        // Refused whole, and told to the sender alone by name; an update that cannot be read follows one the
        // sender has been told of already.
        if (standing !== 'unreadable')
          this.tell(sender.ws, {
            kind: `${kind.frame}-refused`,
            tabId: frame.tabId,
            name: REFUSAL_NAMES[standing],
          });
        return false;
      }
      const limit = await liveTabLimitOf(env, kind, frame.tabId, update, this.hooks.caps);
      if (limit) {
        // Refused whole: nothing stored or relayed; the sender alone is told which limit.
        this.refusedEdit(documentId, frame.tabId, limit);
        this.tell(sender.ws, { kind: `${kind.frame}-refused`, tabId: frame.tabId, limit });
        return false;
      }
      const started = Date.now();
      const log = await appendLiveTabUpdate(env, kind, frame.tabId, update);
      await indexPlacedImages(env, kind, frame.tabId, update);
      const seq = this.hooks.sequence(sender.presenceId, frame, sender.ws);
      const echo = isRoomOpRef(ref) ? { ref } : {};
      this.hooks.sendTo(sender.ws, {
        kind: 'cursor',
        epoch: this.hooks.position().epoch,
        seq,
        ...echo,
      });
      console.info(
        `${kind.tag} persisted document=${documentId} tab=${frame.tabId} bytes=${update.byteLength} log=${log.bytes} updates=${log.updates} ms=${Date.now() - started}`,
      );
      if (compactionDue(kind, log)) {
        const chunks = await compactLiveTab(env, kind, frame.tabId);
        console.info(
          `${kind.tag} compacted document=${documentId} tab=${frame.tabId} chunks=${chunks}`,
        );
      }
      return true;
    });
  }

  /**
   * One update sent by the door, whose route says the sender's level: stored on the same write queue as the frames,
   * then relayed from the system, as an op when it fits a frame, else as the tab's `stale`. An update no row of the
   * log could hold is folded into the chunks at once.
   */
  async acceptPosted(
    documentId: string,
    tabId: string,
    update: Uint8Array,
    // An Editor's unless the route says otherwise: every route gates an edit of the tab before it posts. `on`:
    // what the update was made on, where the kind's state stands on something. `adderKey`: the sender's, where the route
    // knows it.
    {
      level = 'edit',
      on,
      adderKey = null,
    }: { level?: AccessLevel; on?: string; adderKey?: string | null } = {},
  ): Promise<PostedOutcome> {
    const { kind } = this;
    if (!kind.state.decodes(update)) {
      this.refused(documentId, tabId, 'decode');
      return 'decode';
    }
    const { env } = this.hooks;
    if (!env) {
      this.refused(documentId, tabId, 'no-store');
      return 'no-store';
    }
    return this.hooks.enqueue(async () => {
      const tab = await storedLiveTab(env, kind, documentId, tabId);
      if (!tab) {
        this.refused(documentId, tabId, 'wrong-kind');
        return 'wrong-kind';
      }
      const sent = { update, on, level, adderKey };
      const refusal = await this.standingRefusal(env, { documentId, tabId, tab }, sent);
      if (refusal) return refusal;
      const limit = await liveTabLimitOf(env, kind, tabId, update, this.hooks.caps);
      if (limit) {
        this.refusedEdit(documentId, tabId, limit);
        return limit;
      }
      const started = Date.now();
      const folded = update.byteLength > kind.sizes.chunkBytes;
      if (folded) await compactLiveTab(env, kind, tabId, update);
      else {
        const log = await appendLiveTabUpdate(env, kind, tabId, update);
        if (compactionDue(kind, log)) await compactLiveTab(env, kind, tabId);
      }
      await indexPlacedImages(env, kind, tabId, update);
      const encoded = base64OfBytes(update);
      const op =
        encoded.length <= kind.sizes.frameChars
          ? { kind: kind.frame, tabId, update: encoded }
          : { kind: kind.frame, tabId, stale: true as const };
      this.hooks.sequence('system', op);
      console.info(
        `${kind.tag} persisted document=${documentId} tab=${tabId} bytes=${update.byteLength} via=door folded=${folded} relay=${'stale' in op ? 'stale' : 'op'} ms=${Date.now() - started}`,
      );
      return 'stored';
    });
  }
}

/**
 * The gallery images a stored update places, added to its tab's references before it is relayed, so a reader who draws
 * the picture the moment it arrives is served (docs/specs/009-elements/images.md "A live tab's references"); the
 * drain's replace then corrects the rows to what the state places.
 */
async function indexPlacedImages(
  env: DocumentEnv,
  kind: LiveTabKind,
  tabId: string,
  update: Uint8Array,
): Promise<void> {
  const placed = kind.state.placedImages?.(update) ?? [];
  if (placed.length === 0) return;
  await env.DOCUMENT_DB.batch(imageRefAddStatements(env, tabId, [...placed]));
  console.info(`${kind.tag} images indexed tab=${tabId} count=${placed.length}`);
}
