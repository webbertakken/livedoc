// A sheet's changesets on the wire (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D262-D270).
import type { SheetWrite } from '@livedoc/sheets';
import type { ChangesetCounts } from './changesets';

// D264: at most this many writes, cells over them, and bytes of writes in one changeset.
export const SHEET_CHANGESET_WRITES_MAX = 200;
export const SHEET_CHANGESET_CELLS_MAX = 50_000;
export const SHEET_CHANGESET_BYTES_MAX = 8 * 1024 * 1024;

// `sc_` and 10 lowercase Crockford base32 characters (D265, as CS7).
export const SHEET_CHANGESET_ID_PATTERN = /^sc_[0-9abcdefghjkmnpqrstvwxyz]{10}$/;

export function isSheetChangesetId(value: unknown): value is string {
  return typeof value === 'string' && SHEET_CHANGESET_ID_PATTERN.test(value);
}

// D262: the writes in order; `rev` the sheet revision read, `strict` refusing a changeset whose `rev` is behind (D263).
export type SheetChangesetRequest = {
  writes: SheetWrite[];
  summary?: string;
  rev?: number;
  strict?: boolean;
};

export type SheetChangesetWritten = {
  id: string;
  sheetId: string;
  tabId: string;
  rev: number;
  previousRev: number;
  counts: ChangesetCounts;
};

// D270: the changeset (null when nothing changed), the sheet's revision, and the writes as they landed.
export type SheetChangesetResponse = {
  changeset: SheetChangesetWritten | null;
  rev: number;
  applied: SheetWrite[];
};

// A sheet changeset's revert, shaped as a tab changeset's (RevertResponse): what it wrote, the cells it changed, and what
// it kept because it changed since (D266), each by its key: a cell's `<rowId>:<colId>`, `object:<id>`, `vrule:<id>`,
// `frule:<id>`, `band:<id>`, `row:<id>`, `col:<id>` or `title`; no lint, a sheet having none.
export type SheetRevertResponse = {
  changeset: SheetChangesetWritten | null;
  reverted: number;
  kept: { id: string; reason: 'changed' }[];
  lint: null;
};
