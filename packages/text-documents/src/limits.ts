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
/** (default) How long a text document in This Browser waits before writing again after a write failed. */
export const TEXT_DOCUMENT_SAVE_RETRY_MS = 5000;
/** Typing within this is one undo step, as Google groups it. */
export const TEXT_DOCUMENT_UNDO_GROUP_MS = 500;
/** (default) The update log's count past which compaction folds it into chunks: merging many small updates costs more
 *  than their count (5,000 keystrokes ~0.3 s, 20,000 ~5 s), and every state read and digest merges the log. */
export const TEXT_DOCUMENT_LOG_UPDATES = 500;
/** (default) A text document's stored state, history included: past it, edits are refused with the limit named. */
export const TEXT_DOCUMENT_MAX_STATE_BYTES = 64 * 1024 * 1024;

/** (default) Pictures and drawings a text document holds (text-document.md "Limits"); past it, a picture read stays kept. */
export const TEXT_DOCUMENT_MAX_OBJECTS = 2000;
/** (default) Nodes in one equation (objects.md "The equation model"); a page of maths holds a few hundred. */
export const EQUATION_MAX_NODES = 2000;
/** (default) How deep one equation's structures nest; past it, the equation stays kept. */
export const EQUATION_MAX_DEPTH = 32;

// Versions (live-editing-and-storage.md "Versions", "Limits").
/** (default) Google's 30 minutes of edits: a window this long since its first update ends with a version. */
export const TEXT_DOCUMENT_VERSION_EVERY_MS = 30 * 60 * 1000;
/** (default) A burst of stored updates this long ends its window before its 30 minutes are up. */
export const TEXT_DOCUMENT_VERSION_EVERY_UPDATES = 1000;
/** (default) Automatic versions older than this keep the newest of each UTC day. */
export const TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS = 30;
/** (default) Automatic versions a tab keeps: 30 days of non-stop editing takes 1,440; about 2 KB each. */
export const TEXT_DOCUMENT_AUTO_VERSIONS_MAX = 1000;
/** (default) A backstop on a tab's versions' bytes: they measure a few hundred KB near the character limit. */
export const TEXT_DOCUMENT_VERSIONS_MAX_BYTES = 8 * 1024 * 1024;
/** Google's limit of named versions a document. */
export const TEXT_DOCUMENT_NAMED_VERSIONS_MAX = 40;
/** (default) A version's name fits the panel's row in two lines. */
export const TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS = 100;

// A Viewer's copy (live-editing-and-storage.md "A Viewer's copy"). Measured 2026-11-27 on a 1.2 MB state (3,000
// paragraphs, 1,600 suggestions): built in 111 ms, each update copied over in 0.07 ms (p50), 0.84 ms at most, about
// 37 MB of heap for the mirror and the copy together.
/** CPU to build a copy of the largest state it is built for: nine times the measure. Safe range 250 to 2,000. */
export const VIEWER_COPY_BUILD_BUDGET_MS = 1000;
/** CPU to copy one update over: thirty times the slowest measured. Safe range 5 to 100. */
export const VIEWER_COPY_APPLY_BUDGET_MS = 25;
/**
 * A copy whose own state passes this is let go (a Viewer sees the error state): about 60 MB of heap at the measure,
 * half a Durable Object's 128 MB, and the copy compacts into one row under the room's row cap. Safe range 1 MB to
 * the chunk's bytes.
 */
export const VIEWER_COPY_STATE_MAX_BYTES = TEXT_DOCUMENT_CHUNK_BYTES;
/** (default) The copy's kept log is compacted into one row past this many updates, as the state's log is. */
export const VIEWER_COPY_LOG_UPDATES = 500;
/** A stored state past this (history included) is not copied at all, before any is decoded. Safe range 8 to 32 MB. */
export const VIEWER_COPY_SOURCE_MAX_BYTES = 16 * 1024 * 1024;
