// A text document's changesets on the wire (docs/specs/024-agents/agent-changesets.md "A text document's changesets";
// docs/specs/034-text-documents/agents-and-sync.md "Writing").
import type { ChangesetCounts } from './changesets';

// `tc_` and 10 lowercase Crockford base32 characters, as every changeset id.
export const TEXT_CHANGESET_ID_PATTERN = /^tc_[0-9abcdefghjkmnpqrstvwxyz]{10}$/;

export function isTextChangesetId(value: unknown): value is string {
  return typeof value === 'string' && TEXT_CHANGESET_ID_PATTERN.test(value);
}

// The operations' text, the document tab (an id or a name; the first by default), a summary, and the state vector read
// (base64, a view's `X-State-Vector`), which `replace` must match.
export type TextChangesetRequest = {
  ops: string;
  documentTab?: string;
  summary?: string;
  base?: string;
};

export type TextChangesetWritten = {
  id: string;
  tabId: string;
  documentTab: string;
  counts: ChangesetCounts;
};

// The changeset (null when nothing changed, and on a dry run), a result line per operation, and those lines as text.
export type TextChangesetResponse = {
  dryRun: boolean;
  changeset: TextChangesetWritten | null;
  results: string[];
  text: string;
};

export const TEXT_CHANGESET_ERRORS = [
  'invalid_operation',
  'not_a_text_document',
  'text_not_found',
  'text_ambiguous',
  'ref_not_found',
  'stale_tab',
  'document_too_large',
  'forbidden_operation',
] as const;
export type TextChangesetError = (typeof TEXT_CHANGESET_ERRORS)[number];

// A refusal: the operation's line in the text and its place among the operations (0 for the changeset as a whole),
// and each paragraph an ambiguous text occurs in.
export type TextChangesetRefusal = {
  error: TextChangesetError;
  line: number;
  operation: number;
  message: string;
  paragraphs?: number[];
};

// A text changeset's revert: the changeset it wrote (null when there was nothing left to undo).
export type TextRevertResponse = {
  changeset: TextChangesetWritten | null;
};
