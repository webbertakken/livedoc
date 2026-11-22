// How much of a file LiveDoc holds (docs/specs/006-document/blob-store.md "Limits"). Here, beside the key, because a
// tab's validator bounds the size a tab may name and the api and the editor bound an upload by the same numbers.

/** The file tab's cap, for every blob (ruled by Webber, 2026-11-21): 100 MB. */
export const FILE_TAB_MAX_BYTES = 100_000_000;
/** (default) Up to it a file is stored in one request; above it, in parts. Safe range: 8 MiB to 64 MiB. */
export const FILE_SINGLE_UPLOAD_MAX_BYTES = 33_554_432;
/** (default) A part of an upload above that: over object storage's 5 MiB least part. Safe range: 5 MiB to 32 MiB. */
export const FILE_PART_BYTES = 8_388_608;
/** (default) An unfinished upload is forgotten after this long: a day to resume. Safe range: 1 to 168 hours. */
export const FILE_UPLOAD_ABANDON_HOURS = 24;
/** A previous version is held this long after it stopped being a tab's bytes, as the Trash keeps a document. */
export const FILE_PREVIOUS_VERSION_DAYS = 30;
/** (default) A blob nothing holds is deleted after this long: longer than any upload. Safe range: 1 to 168 hours. */
export const FILE_UNHELD_GRACE_HOURS = 24;

/** How many parts a file of that size travels in. */
export const filePartCount = (size: number): number => Math.ceil(size / FILE_PART_BYTES);

/** The bytes of part `n` (from 1) of a file of that size: every part is whole but the last. */
export const filePartSize = (size: number, n: number): number =>
  Math.min(FILE_PART_BYTES, size - (n - 1) * FILE_PART_BYTES);
