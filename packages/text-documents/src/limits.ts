// A text document's limits (docs/specs/034-text-documents/text-document.md "Limits",
// docs/specs/034-text-documents/live-editing-and-storage.md "Limits").

/** Characters in one text document: Google Docs' own limit. */
export const TEXT_DOCUMENT_MAX_CHARS = 1_020_000;
/** One stored chunk of the encoded state: under the room's 2,000,000-byte row cap with room for the row's columns. */
export const TEXT_DOCUMENT_CHUNK_BYTES = 1_900_000;
/** (default) The update log's size past which compaction folds it into chunks. */
export const TEXT_DOCUMENT_LOG_BYTES = 4_000_000;
