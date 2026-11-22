// How much of a file LiveDoc holds (docs/specs/006-document/blob-store.md "Limits"). Here, beside the key, because a
// tab's validator bounds the size a tab may name and the api and the editor bound an upload by the same numbers.

/** The file tab's cap, for every blob (ruled by Webber, 2026-11-21): 100 MB. */
export const FILE_TAB_MAX_BYTES = 100_000_000;
/** (default) Up to it a file is stored in one request; above it, in parts. Safe range: 8 MiB to 64 MiB. */
export const FILE_SINGLE_UPLOAD_MAX_BYTES = 33_554_432;
