// Binds a text document's live state to the room (docs/specs/034-text-documents/live-editing-and-storage.md "Sending",
// "Reconnecting", "The local copy"): the binding every live tab kind has (docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state"), with what the text document declares of its own.
import {
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOCAL_SAVE_MS,
  TextDocumentState,
} from '@livedoc/text-documents';
import {
  openLiveTabRoom,
  type LiveTabClientKind,
  type LiveTabFrame,
  type LiveTabRoomBinding,
  type LiveTabRoomDeps,
} from '@/lib/live-tab/live-tab-room-binding';
import { TextDocumentBus } from './text-document-bus';

export { COPY_ORIGIN, ROOM_ORIGIN } from '@/lib/live-tab/live-tab-room-binding';

export type TextDocumentFrame = LiveTabFrame<'text-document'>;
export type RoomYjsDeps = LiveTabRoomDeps<'text-document'>;
export type RoomYjsBinding = LiveTabRoomBinding;

const TEXT_DOCUMENT_LIVE_TAB: LiveTabClientKind<'text-document'> = {
  frame: 'text-document',
  tag: '[text-document]',
  frameChars: TEXT_DOCUMENT_FRAME_CHARS,
  localSaveMs: TEXT_DOCUMENT_LOCAL_SAVE_MS,
  bus: TextDocumentBus,
  load: (updates) => TextDocumentState.load(updates),
};

/** Read the state (and any local copy left behind), then bind it to the room. Rejects when the state cannot be read. */
export const openRoomYjs = (deps: RoomYjsDeps): Promise<RoomYjsBinding> =>
  openLiveTabRoom(TEXT_DOCUMENT_LIVE_TAB, deps);
