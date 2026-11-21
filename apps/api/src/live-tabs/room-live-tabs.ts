// A live tab kind's edits in its room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): the room is
// the one writer. Each frame of the kind is checked (its tab is of the kind and in this document, its update decodes,
// no limit is passed), appended to the tab's log on the room's write queue, and only then sequenced to everyone else,
// so nothing relayed is unstored. Updates commute, so the order the queue keeps is for storage, not for merging.
import { isRoomOpRef, type ServerMessage } from '@livedoc/api-schema';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents';
import type { DocumentEnv } from '../types';
import type { LiveTabCaps, LiveTabKind, LiveTabLimit } from './live-tab-kind';
import { liveTabLimitOf } from './live-tab-limits';
import {
  appendLiveTabUpdate,
  compactionDue,
  compactLiveTab,
  storedLiveTab,
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

export type LiveTabSender = { ws: WebSocket; presenceId: string; documentId: string | null };

type LiveTabFrame = { kind: string; tabId: string; update: string };

/** Why a frame was refused, for the log's fingerprint. */
export type LiveTabRefusal = 'shape' | 'decode' | 'wrong-kind' | 'no-store';

/** What became of an update sent by the door: stored (and relayed), or why it was refused. */
export type PostedOutcome = 'stored' | Exclude<LiveTabRefusal, 'shape'> | LiveTabLimit;

/** The frame, when the op is one of the kind's; else null. */
export function liveTabFrameOf(kind: LiveTabKind, op: unknown): LiveTabFrame | null {
  if (typeof op !== 'object' || op === null) return null;
  const frame = op as { kind?: unknown; tabId?: unknown; update?: unknown };
  if (frame.kind !== kind.frame) return null;
  if (typeof frame.tabId !== 'string' || typeof frame.update !== 'string') return null;
  return { kind: kind.frame, tabId: frame.tabId, update: frame.update };
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

  /** One frame of the kind from an Editor's socket: stored, then relayed; refused and logged otherwise. */
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
      if (!(await storedLiveTab(env, kind, documentId, frame.tabId))) {
        this.refused(documentId, frame.tabId, 'wrong-kind');
        return false;
      }
      const limit = await liveTabLimitOf(env, kind, frame.tabId, update, this.hooks.caps);
      if (limit) {
        // Refused whole: nothing stored or relayed; the sender alone is told which limit.
        this.refusedEdit(documentId, frame.tabId, limit);
        this.hooks.sendTo(sender.ws, {
          kind: 'op',
          from: 'system',
          op: { kind: `${kind.frame}-refused`, tabId: frame.tabId, limit },
        });
        return false;
      }
      const started = Date.now();
      const log = await appendLiveTabUpdate(env, kind, frame.tabId, update);
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
   * One update sent by the door, already gated by the route: stored on the same write queue as the frames, then
   * relayed from the system, as an op when it fits a frame, else as the tab's `stale`. An update no row of the log
   * could hold is folded into the chunks at once.
   */
  async acceptPosted(
    documentId: string,
    tabId: string,
    update: Uint8Array,
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
      if (!(await storedLiveTab(env, kind, documentId, tabId))) {
        this.refused(documentId, tabId, 'wrong-kind');
        return 'wrong-kind';
      }
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
