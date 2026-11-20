// A text document's limits (docs/specs/034-text-documents/text-document.md "Limits",
// docs/specs/034-text-documents/live-editing-and-storage.md "Limits").

/** Characters in one text document: Google Docs' own limit. */
export const TEXT_DOCUMENT_MAX_CHARS = 1_020_000;
/** One stored chunk of the encoded state: under the room's 2,000,000-byte row cap with room for the row's columns. */
export const TEXT_DOCUMENT_CHUNK_BYTES = 1_900_000;
/** (default) The update log's size past which compaction folds it into chunks. */
export const TEXT_DOCUMENT_LOG_BYTES = 4_000_000;
/** (default) Kept XML per text document, blocks and inlines (standard-mapping.md "Limits"). */
export const KEPT_CONTENT_MAX_BYTES = 1_048_576;
/** (default) Words a page holds when pages are counted without layout: 11 pt Arial at single spacing. */
export const TEXT_DOCUMENT_WORDS_PER_PAGE = 500;
/** The most base64 one `text-document` op carries: inside the room's 256 KB message cap with room for the envelope. */
export const TEXT_DOCUMENT_FRAME_CHARS = 200_000;
/** The most bytes one update sent by the door may hold: the api's body cap. */
export const TEXT_DOCUMENT_UPDATE_MAX_BYTES = 8 * 1024 * 1024;
/** (default) How long an edit the room has not confirmed waits before this browser keeps a copy of it. */
export const TEXT_DOCUMENT_LOCAL_SAVE_MS = 500;
/** Typing within this is one undo step, as Google groups it. */
export const TEXT_DOCUMENT_UNDO_GROUP_MS = 500;
/** (default) The update log's count past which compaction folds it into chunks: merging many small updates costs more
 *  than their count (5,000 keystrokes ~0.3 s, 20,000 ~5 s), and every state read and digest merges the log. */
export const TEXT_DOCUMENT_LOG_UPDATES = 500;
