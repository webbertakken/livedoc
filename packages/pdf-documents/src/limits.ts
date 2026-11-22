// A PDF document's limits (docs/specs/035-pdf-documents/pdf-document.md "Limits", opening.md "Limits",
// live-editing-and-storage.md "Limits", marks.md "Limits").

/** Where readers look for `%PDF-`: a file with leading junk still opens. */
export const PDF_SNIFF_BYTES = 1_024;
/** (default) Marks in one PDF document: far past use, and a bound on what one open replays. Safe range: 1,000 up. */
export const PDF_MAX_MARKS = 20_000;
/** (default) A ceiling on a PDF document's pages; a file arriving with more opens and takes no insert. */
export const PDF_MAX_PAGES = 100_000;
/** (default) One draw of one page; a decompression bomb draws at most this. Safe range: 2^24 to 2^28. */
export const PDF_MAX_PAGE_PIXELS = 268_435_456;
/** (default) The whole-page picture a page is first drawn as (reading-surface.md "Limits"): sharper detail is the tiles'.
 *  Safe range: 2^21 to 2^25. */
export const PDF_PAGE_PICTURE_MAX_PIXELS = 8_388_608;
/** The most a PDF page measures on a side, in points: the standard's own 200 inches. */
export const PDF_MAX_PAGE_POINTS = 14_400;
/** (default) A Text mark's or a note's words, and the text a text mark covered; longer belongs in a document. */
export const PDF_MARK_TEXT_MAX_CHARS = 10_000;
/** (default) The quadrilaterals of one text mark: a page of small type selected whole is a few hundred lines. */
export const PDF_MARK_MAX_QUADS = 2_000;
/** (default) Past it the stored file is replaced (saving.md "Limits"); the room refuses a state beyond it. */
export const PDF_LIVE_CHANGES_MAX_BYTES = 4_194_304;
/** (default) One posted update: the api's body cap, as a text document's. */
export const PDF_UPDATE_MAX_BYTES = 8_000_000;
/** One stored chunk of the encoded state: under the room's 2,000,000-byte row cap with room for the row's columns. */
export const PDF_CHUNK_BYTES = 1_900_000;
/** (default) The update log's size past which compaction folds it into chunks: the live changes' own ceiling. */
export const PDF_LOG_BYTES = PDF_LIVE_CHANGES_MAX_BYTES;
/** (default) The update log's count past which compaction folds it, as a text document's. Safe range: 100 to 5,000. */
export const PDF_LOG_UPDATES = 500;
/** (default) How long a change the room has not confirmed waits before this browser keeps it, as a text document's.
 *  Safe range: 100 to 2,000. */
export const PDF_LOCAL_SAVE_MS = 500;
/** The most base64 one `pdf` op carries: inside the room's 256 KB message cap with room for the envelope. */
export const PDF_FRAME_CHARS = 200_000;
