// Parse a positive-integer cap from a wrangler.toml [vars] entry.
// Returns null when the string is missing, blank, non-numeric, or
// not strictly positive, so callers treat "unset" and "0" and
// "garbage" identically as "no cap" (the OSS self-host default per
// docs/specs/009-elements/images.md and docs/specs/006-document/blob-store.md).
export function parsePositiveCap(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
