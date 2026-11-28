// A text changeset's body read (docs/specs/024-agents/agent-changesets.md "A text document's changesets"): its
// operations' text (the engine reads them), the document tab, a summary as a tab changeset's, and the state vector the
// agent read. An element changeset's body sent to a text document is named for what it is.
import { CHANGESET_SUMMARY_MAX, type TextChangesetRequest } from '@livedoc/api-schema';
import {
  bytesOfBase64,
  parseTextOps,
  TextDocumentState,
  type TextOpLine,
} from '@livedoc/text-documents';
import { parseSummary } from '../changesets/request';

export type TextChangesetBody = {
  /** The operations as sent, recorded with the changeset. */
  text: string;
  ops: TextOpLine[];
  documentTab: string | undefined;
  summary: string | null;
  base: Uint8Array | undefined;
};

export type TextChangesetRefused = { status: number; body: Record<string, unknown> };

const refuse = (
  status: number,
  body: Record<string, unknown>,
): { ok: false; refused: TextChangesetRefused } => ({ ok: false, refused: { status, body } });

/** The refusal for an element changeset's body on a text document, or text operations on another tab. */
export const NOT_A_TEXT_DOCUMENT: TextChangesetRefused = {
  status: 400,
  body: {
    error: 'not_a_text_document',
    line: 0,
    operation: 0,
    message:
      'a text document takes text operations as "ops" (edit, insert, append, …); element operations and replace bodies go to a canvas tab',
  },
};

/** Whether a body is a text changeset's: `ops` and none of an element changeset's members. */
export const isTextBody = (raw: unknown): boolean =>
  typeof raw === 'object' &&
  raw !== null &&
  'ops' in raw &&
  !('operations' in raw) &&
  !('replace' in raw);

export function parseTextChangeset(
  raw: unknown,
): { ok: true; value: TextChangesetBody } | { ok: false; refused: TextChangesetRefused } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return refuse(400, { error: 'invalid_body', message: 'expected a JSON object' });
  const b = raw as Partial<Record<keyof TextChangesetRequest, unknown>> & Record<string, unknown>;
  if (!isTextBody(b)) return { ok: false, refused: NOT_A_TEXT_DOCUMENT };
  if (typeof b.ops !== 'string')
    return refuse(400, {
      error: 'invalid_body',
      message: '"ops" is the operations as text, one a line',
    });
  if (b.documentTab !== undefined && (typeof b.documentTab !== 'string' || b.documentTab === ''))
    return refuse(400, {
      error: 'invalid_body',
      message: '"documentTab" is a document tab’s id or name',
    });
  const summary = parseSummary(b.summary);
  if (!summary.ok)
    return summary.refused === 'too_long'
      ? refuse(400, {
          error: 'invalid_value',
          message: `"summary" holds at most ${CHANGESET_SUMMARY_MAX} characters`,
        })
      : refuse(400, { error: 'invalid_body', message: '"summary" must be a string' });
  let base: Uint8Array | undefined;
  if (b.base !== undefined) {
    const bytes = typeof b.base === 'string' ? bytesOfBase64(b.base) : null;
    if (!bytes || !TextDocumentState.isStateVector(bytes))
      return refuse(400, {
        error: 'invalid_base',
        message: '"base" is a view’s X-State-Vector, as it was answered (base64)',
      });
    base = bytes;
  }
  const parsed = parseTextOps(b.ops);
  if (!parsed.ok) {
    const { ok: _, ...refusal } = parsed;
    return refuse(refusal.line === 0 && refusal.message.startsWith('at most') ? 413 : 400, refusal);
  }
  return {
    ok: true,
    value: {
      text: b.ops,
      ops: parsed.ops,
      documentTab: b.documentTab,
      summary: summary.text,
      base,
    },
  };
}
