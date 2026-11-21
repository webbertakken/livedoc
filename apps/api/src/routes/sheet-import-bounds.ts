// The bounds of a spreadsheet's fetches from the web (docs/specs/029-sheets/imports.md "The api's guards", D66), shared
// by the imports (sheet-imports-route.ts) and IMAGE's pictures (sheet-image-route.ts).

// The fetch's bounds (D66): safe ranges 5 to 20 s, 1 to 10 MB, 3 to 10 redirects.
export const IMPORT_FETCH_MS = 10_000;
export const IMPORT_BYTES_MAX = 5 * 1024 * 1024;
export const IMPORT_REDIRECTS_MAX = 5;
// How long an answer is kept for everyone: Google's hourly refresh.
export const IMPORT_CACHE_S = 3_600;
export const IMPORT_USER_AGENT = 'livedoc-import/1.0 (+https://docs.nu)';
