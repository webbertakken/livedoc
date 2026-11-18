// Binds a text document's live state to the room (docs/specs/034-text-documents/live-editing-and-storage.md): every
// change made here goes out as one `text-document` op; every update from the room is applied with the remote origin,
// so it is never sent back. On a resync the stored state is fetched again and merged, and what this browser holds that
// the room does not is sent: Yjs makes both idempotent, so nothing is lost or doubled.
import * as Y from 'yjs';
import { base64OfBytes } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { TextDocumentBus } from './text-document-bus';

/** The origin a room update is applied with, so the provider never echoes it. */
export const ROOM_ORIGIN = Symbol('room');

// An update with no structs and no deletions: two zero counts.
const EMPTY_UPDATE_BYTES = 2;

export type RoomYjsProviderDeps = {
  doc: Y.Doc;
  tabId: string;
  // Whether this session may change the writing; a viewer's document never sends.
  canEdit: boolean;
  send: (op: { kind: 'text-document'; tabId: string; update: string }) => void;
  loadState: () => Promise<Uint8Array>;
};

export function bindRoomYjsProvider(deps: RoomYjsProviderDeps): () => void {
  const { doc, tabId, send } = deps;
  const onLocal = (update: Uint8Array, origin: unknown) => {
    if (origin === ROOM_ORIGIN || !deps.canEdit) return;
    send({ kind: 'text-document', tabId, update: base64OfBytes(update) });
  };
  doc.on('update', onLocal);
  const offUpdate = TextDocumentBus.onUpdate(tabId, (update) =>
    Y.applyUpdate(doc, update, ROOM_ORIGIN),
  );
  const offResync = TextDocumentBus.onResync(() => {
    void deps
      .loadState()
      .then((state) => {
        const before = Y.encodeStateVectorFromUpdate(state);
        Y.applyUpdate(doc, state, ROOM_ORIGIN);
        // What this browser holds that the room's state does not: sent once, merged by the room.
        const missing = Y.encodeStateAsUpdate(doc, before);
        if (deps.canEdit && missing.byteLength > EMPTY_UPDATE_BYTES)
          send({ kind: 'text-document', tabId, update: base64OfBytes(missing) });
        debugLog('[text-document] resynced', { tabId, bytes: state.byteLength });
      })
      .catch((error: unknown) =>
        debugLog('[text-document] resync failed', { tabId, error: String(error) }),
      );
  });
  return () => {
    doc.off('update', onLocal);
    offUpdate();
    offResync();
  };
}
