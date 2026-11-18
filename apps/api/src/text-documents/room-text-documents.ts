// A text document's edits in its room (docs/specs/034-text-documents/live-editing-and-storage.md "Storage"): the
// room is the one writer. Each `text-document` frame is checked (its tab is a text document of this document, its
// update decodes), appended to the tab's log on the room's write queue, and only then sequenced to everyone else,
// so nothing relayed is unstored. Updates commute, so the order the queue keeps is for storage, not for merging.

import { isRoomOpRef, type ServerMessage } from '@livedoc/api-schema';
import { TextDocumentState } from '@livedoc/text-documents';
import type { DocumentEnv } from '../types';
import { bytesOfBase64 } from '@livedoc/text-documents';
import {
  appendTextDocumentUpdate,
  compactionDue,
  compactTextDocument,
  storedTextDocumentTab,
} from './text-document-store';

type RoomTextDocumentHooks = {
  env: DocumentEnv | undefined;
  enqueue: <T>(step: () => Promise<T>) => Promise<T>;
  sequence: (from: string, op: unknown, except?: WebSocket) => number;
  sendTo: (ws: WebSocket, payload: ServerMessage) => void;
  position: () => { epoch: string };
};

export type TextDocumentSender = { ws: WebSocket; presenceId: string; documentId: string | null };

type TextDocumentFrame = { kind: 'text-document'; tabId: string; update: string };

/** Why a frame was refused, for the log's fingerprint. */
export type TextDocumentRefusal = 'shape' | 'decode' | 'not-text-document' | 'no-store';

export function textDocumentFrameOf(op: unknown): TextDocumentFrame | null {
  if (typeof op !== 'object' || op === null) return null;
  const frame = op as { kind?: unknown; tabId?: unknown; update?: unknown };
  if (frame.kind !== 'text-document') return null;
  if (typeof frame.tabId !== 'string' || typeof frame.update !== 'string') return null;
  return { kind: 'text-document', tabId: frame.tabId, update: frame.update };
}

const refused = (documentId: string | null, tabId: string | null, reason: TextDocumentRefusal) =>
  console.warn(
    `[text-document] update-refused document=${documentId ?? 'unbound'} tab=${tabId ?? '-'} reason=${reason}`,
  );

export class RoomTextDocuments {
  private readonly hooks: RoomTextDocumentHooks;

  constructor(hooks: RoomTextDocumentHooks) {
    this.hooks = hooks;
  }

  /** One `text-document` frame from an Editor's socket: stored, then relayed; refused and logged otherwise. */
  async accept(sender: TextDocumentSender, op: unknown, ref?: unknown): Promise<boolean> {
    const frame = textDocumentFrameOf(op);
    if (!frame) {
      refused(sender.documentId, null, 'shape');
      return false;
    }
    const update = bytesOfBase64(frame.update);
    if (!update || !TextDocumentState.decodes(update)) {
      refused(sender.documentId, frame.tabId, 'decode');
      return false;
    }
    const { env } = this.hooks;
    const documentId = sender.documentId;
    if (!env || !documentId) {
      refused(documentId, frame.tabId, 'no-store');
      return false;
    }
    return this.hooks.enqueue(async () => {
      if (!(await storedTextDocumentTab(env, documentId, frame.tabId))) {
        refused(documentId, frame.tabId, 'not-text-document');
        return false;
      }
      const started = Date.now();
      const logBytes = await appendTextDocumentUpdate(env, frame.tabId, update);
      const seq = this.hooks.sequence(sender.presenceId, frame, sender.ws);
      const echo = isRoomOpRef(ref) ? { ref } : {};
      this.hooks.sendTo(sender.ws, {
        kind: 'cursor',
        epoch: this.hooks.position().epoch,
        seq,
        ...echo,
      });
      console.info(
        `[text-document] persisted document=${documentId} tab=${frame.tabId} bytes=${update.byteLength} log=${logBytes} ms=${Date.now() - started}`,
      );
      if (compactionDue(logBytes)) {
        const chunks = await compactTextDocument(env, frame.tabId);
        console.info(
          `[text-document] compacted document=${documentId} tab=${frame.tabId} chunks=${chunks}`,
        );
      }
      return true;
    });
  }
}
