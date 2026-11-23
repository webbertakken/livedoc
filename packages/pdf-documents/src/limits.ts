// A PDF document's limits (docs/specs/035-pdf-documents/pdf-document.md "Limits", opening.md "Limits",
// live-editing-and-storage.md "Limits", marks.md "Limits").

/** Where readers look for `%PDF-`: a file with leading junk still opens. */
export const PDF_SNIFF_BYTES = 1_024;
/** (default) Marks in one PDF document: far past use, and a bound on what one open replays. Safe range: 1,000 up. */
export const PDF_MAX_MARKS = 20_000;
/** (default) A ceiling on a PDF document's pages; a file arriving with more opens and takes no insert. */
export const PDF_MAX_PAGES = 100_000;
/** (default) How long the engine may answer nothing while a call waits (an open, a draw, a bake) before whoever
 *  started it ends it (opening.md "Limits"). Measured on a 93 MB file: 0.03 s, 0.7 s, 0.5 s. Safe range: 10,000 to
 *  120,000. */
export const PDF_ENGINE_TIMEOUT_MS = 30_000;
/** (default) The most memory the engine's reader may hold in a browser before it is ended; a 100 MB file read whole
 *  was measured at 724 MiB at most. Safe range: 2^29 to 2^31. */
export const PDF_WORKER_MAX_BYTES = 1_073_741_824;
/** (default) The same on a phone: a device that says it has 4 GB of memory or less, or says nothing and is touched. */
export const PDF_WORKER_PHONE_MAX_BYTES = 268_435_456;
/** (default) The most memory, in gigabytes, a device says it has and is still held to the phone's ceiling. */
export const PDF_PHONE_MAX_DEVICE_GB = 4;
/** (default) One draw of one page; a decompression bomb draws at most this. Safe range: 2^24 to 2^28. */
export const PDF_MAX_PAGE_PIXELS = 268_435_456;
/** (default) The whole-page picture a page is first drawn as (reading-surface.md "Limits"): sharper detail is the tiles'.
 *  Safe range: 2^21 to 2^25. */
export const PDF_PAGE_PICTURE_MAX_PIXELS = 8_388_608;
/** (default) One page's text read at once, twenty times a dense page; a page past it reads its first part. Safe
 *  range: 20,000 to 2,000,000. */
export const PDF_PAGE_TEXT_MAX_CHARS = 200_000;
/** The most a PDF page measures on a side, in points: the standard's own 200 inches. */
export const PDF_MAX_PAGE_POINTS = 14_400;
/** (default) An address longer than this is shown cut and never opened (security.md "Limits"). */
export const PDF_LINK_MAX_CHARS = 2_048;
/** (default) Deeper than any honest outline, page tree or field tree: a walk stops there. */
export const PDF_MAX_TREE_DEPTH = 256;
/** (default) Bookmarks read from one file; past it the outline is cut and says so. Safe range: 1,000 to 100,000. */
export const PDF_OUTLINE_MAX_ITEMS = 20_000;
/** (default) Links read on one page. Safe range: 500 to 50,000. */
export const PDF_PAGE_MAX_LINKS = 5_000;
/** (default) A property of the file (title, author, subject, keywords, producer) is cut to it (security.md "Limits"). */
export const PDF_PROPERTY_MAX_CHARS = 2_048;
/** (default) A file's string shown as a name (a page label, a bookmark, an embedded file) is cut to it. */
export const PDF_NAME_MAX_CHARS = 255;
/** (default) A Text mark's or a note's words, and the text a text mark covered; longer belongs in a document. */
export const PDF_MARK_TEXT_MAX_CHARS = 10_000;
/** (default) The quadrilaterals of one text mark: a page of small type selected whole is a few hundred lines. */
export const PDF_MARK_MAX_QUADS = 2_000;
/** (default) Past it the stored file is replaced (saving.md "Limits"); the room refuses a state beyond it. */
export const PDF_LIVE_CHANGES_MAX_BYTES = 4_194_304;
/** (default) Past it an idle Editor's surface replaces the stored file: three quarters of the ceiling, so ordinary use
 *  never meets the ceiling itself (live-editing-and-storage.md "Replacing the stored file"). */
export const PDF_REPLACE_AT_BYTES = 3_145_728;
/** (default) How long nothing changed here or arrived before a surface replaces the stored file for the budget.
 *  Safe range: 5,000 to 120,000. */
export const PDF_REPLACE_IDLE_MS = 20_000;
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
/** (default) A failed save in This Browser is written again by itself after this long, as a text document's. Safe
 *  range: 1,000 to 60,000. */
export const PDF_LOCAL_SAVE_RETRY_MS = 5_000;
/** Changes typed within this long of each other are one step of a person's undo, as a text document's. */
export const PDF_UNDO_GROUP_MS = 500;
/** The most base64 one `pdf` op carries: inside the room's 256 KB message cap with room for the envelope. */
export const PDF_FRAME_CHARS = 200_000;
/** (default) A coordinate read from a file is held within two pages' reach of the page's origin (security.md "Limits"). */
export const PDF_MAX_COORDINATE = 28_800;
/** (default) Marks read on one page; a page past it reads its first, and the rest still draw. Safe range: 500 to 50,000. */
export const PDF_PAGE_MAX_MARKS = 5_000;
/** (default) Fields read from one file, and places read on one page (fields.md "Limits"). */
export const PDF_MAX_FIELDS = 10_000;
/** (default) A field's full name (building-fields.md "Limits"). */
export const PDF_FIELD_NAME_MAX_CHARS = 255;
/** (default) One field value, unless the field's own maximum is smaller (fields.md "Limits"). */
export const PDF_FIELD_VALUE_MAX_CHARS = 100_000;
/** (default) Options of one dropdown or list (building-fields.md "Limits"). */
export const PDF_FIELD_OPTIONS_MAX = 5_000;
/** (default) Signatures read from one file; more are kept in the file and not listed (signing.md "Limits"). */
export const PDF_MAX_SIGNATURES = 1_000;
/** (default) One signature's bytes read; a signature with its certificates is tens of kilobytes. */
export const PDF_SIGNATURE_MAX_BYTES = 1_048_576;
/** (default) Embedded files listed and added here; a file with more keeps them all (document-tools.md "Limits"). */
export const PDF_EMBEDDED_FILES_MAX = 500;
/** (default) The most of one embedded file read out to be saved or opened: a stored file's cap
 *  (reading-surface.md "Embedded files"). */
export const PDF_EMBEDDED_FILE_MAX_BYTES = 100_000_000;
/** (default) PDF layers read from one file; more are shown as the file sets them and not listed. */
export const PDF_MAX_LAYERS = 1_000;
/** (default) How wide the first page's picture is that a browser sends for the thumbnail: twice the widest card a
 *  list draws. Safe range: 240 to 960. */
export const PDF_THUMBNAIL_WIDTH_PX = 480;
/** (default) The longest side that picture may have: a page four times as tall as wide still fits. The server
 *  refuses more. */
export const PDF_THUMBNAIL_MAX_SIDE_PX = 1_024;
/** (default) The most bytes that picture may be, a JPEG: a page of photographs at that size. A list of 50 rows
 *  stays under 14 MB as base64. */
export const PDF_THUMBNAIL_MAX_BYTES = 200_000;
/** (default) How long after its last confirmed change a surface sends the picture again: past the room's own write
 *  of a change (2 s idle). Safe range: 2,000 to 60,000. */
export const PDF_THUMBNAIL_IDLE_MS = 5_000;
/** (default) The least time between two pictures one surface sends, as the room writes at most once a minute. */
export const PDF_THUMBNAIL_MIN_INTERVAL_MS = 60_000;
/** The least and the most a page is zoomed (reading-surface.md "Limits"), as scales: Acrobat's range, 10% to 6400%. */
export const PDF_ZOOM_MIN = 0.1;
export const PDF_ZOOM_MAX = 64;
/** (default) Where Zoom in and Zoom out stop, as scales: Acrobat's own steps within the range. */
export const PDF_ZOOM_STEPS: readonly number[] = [
  0.1, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64,
];
/** (default) Fit width's ceiling, so a page on a wide window is not drawn larger than it reads well. Safe range: 1
 *  to 4. */
export const PDF_FIT_WIDTH_MAX = 2;
/** (default) ⌘ with the wheel multiplies the zoom by e to this times the pixels wheeled: a notch of 100 is 22%.
 *  Safe range: 0.001 to 0.005. */
export const PDF_WHEEL_ZOOM_RATE = 0.002;
/** (default) How long a wheel rests before it turns another row of a display that shows one row. Safe range: 150 to
 *  600. */
export const PDF_WHEEL_TURN_MS = 300;
/** (default) How long a wheel's or a pinch's zoom rests before it is told to telemetry, once a gesture. Safe range:
 *  200 to 1,000. */
export const PDF_ZOOM_SETTLE_MS = 400;
/** (default) A tile's side in CSS pixels (reading-surface.md "The pages", "Limits"). Safe range: 256 to 1,024. */
export const PDF_TILE_PX = 512;
/** (default) The tiles a desktop keeps, in bytes of their pictures; least lately shown let go first. */
export const PDF_TILE_CACHE_BYTES = 134_217_728;
/** (default) The tiles a phone keeps (reading-surface.md "Phone and tablet"). */
export const PDF_TILE_PHONE_CACHE_BYTES = 50_331_648;
/** (default) The most device pixels a CSS pixel a phone's tiles are drawn at. */
export const PDF_PHONE_PIXEL_RATIO = 2;
/** (default) CSS pixels a side of the square a thumbnail of the left panel is fitted into (reading-surface.md
 *  "Thumbnails"). Safe range: 96 to 224. */
export const PDF_THUMBNAIL_BOX_PX = 160;
/** (default) Pages whose text the surface keeps read for selecting, least lately used let go first (reading-surface.md
 *  "Limits"). Safe range: 8 to 256. */
export const PDF_PAGE_TEXTS_KEPT = 32;
