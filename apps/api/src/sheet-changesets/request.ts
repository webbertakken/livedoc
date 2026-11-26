// A sheet changeset's body read (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D262-D264): its
// writes in order, each an object of a known kind (the engine checks the rest), within the changeset's caps; a summary
// as a tab changeset's; the revision read and `strict`.
import {
  CHANGESET_SUMMARY_MAX,
  SHEET_CHANGESET_BYTES_MAX,
  SHEET_CHANGESET_CELLS_MAX,
  SHEET_CHANGESET_WRITES_MAX,
} from '@livedoc/api-schema';
import type { SheetWrite } from '@livedoc/sheets';
import { parseSummary } from '../changesets/request';

export type SheetChangesetBody = {
  writes: SheetWrite[];
  summary: string | null;
  rev: number | null;
  strict: boolean;
};

type Refused = { status: number; body: { error: string; message: string } };

const refuse = (
  status: number,
  error: string,
  message: string,
): { ok: false; refused: Refused } => ({
  ok: false,
  refused: { status, body: { error, message } },
});

const KINDS: ReadonlySet<unknown> = new Set(['cells', 'layout', 'title']);

const cellCount = (w: SheetWrite) =>
  w.kind === 'title' ? 0 : Array.isArray(w.cells) ? w.cells.length : 0;

// `text` is the body as sent, so its size is measured before it is parsed.
export function parseSheetChangeset(
  text: string,
): { ok: true; value: SheetChangesetBody } | { ok: false; refused: Refused } {
  if (text.length > SHEET_CHANGESET_BYTES_MAX)
    return refuse(
      413,
      'too_large',
      `A changeset holds at most ${SHEET_CHANGESET_BYTES_MAX} bytes of writes`,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse(400, 'invalid_body', 'The body is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return refuse(400, 'invalid_body', 'The body is a JSON object');
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.writes) || b.writes.length === 0)
    return refuse(400, 'invalid_body', '"writes" is a list of at least one sheet write');
  if (b.writes.length > SHEET_CHANGESET_WRITES_MAX)
    return refuse(
      413,
      'too_large',
      `A changeset holds at most ${SHEET_CHANGESET_WRITES_MAX} writes`,
    );
  const writes = b.writes as SheetWrite[];
  if (writes.some((w) => typeof w !== 'object' || w === null || !KINDS.has(w.kind)))
    return refuse(400, 'invalid_body', 'Each write is a cells, layout or title write');
  if (writes.reduce((n, w) => n + cellCount(w), 0) > SHEET_CHANGESET_CELLS_MAX)
    return refuse(
      413,
      'too_large',
      `A changeset changes at most ${SHEET_CHANGESET_CELLS_MAX} cells`,
    );
  const summary = parseSummary(b.summary);
  if (!summary.ok)
    return summary.refused === 'too_long'
      ? refuse(400, 'invalid_value', `"summary" holds at most ${CHANGESET_SUMMARY_MAX} characters`)
      : refuse(400, 'invalid_body', '"summary" must be a string');
  const rev = b.rev ?? null;
  if (rev !== null && !(typeof rev === 'number' && Number.isSafeInteger(rev) && rev >= 0))
    return refuse(400, 'invalid_base', '"rev" is the sheet revision read, a whole number');
  if (b.strict !== undefined && typeof b.strict !== 'boolean')
    return refuse(400, 'invalid_body', '"strict" is true or false');
  const strict = b.strict === true;
  if (strict && rev === null)
    return refuse(400, 'strict_needs_base', '"strict" needs the "rev" the sheet was read at');
  return { ok: true, value: { writes, summary: summary.text, rev, strict } };
}
