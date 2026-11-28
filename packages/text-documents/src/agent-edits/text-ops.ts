// A text document's changeset operations (docs/specs/034-text-documents/agents-and-sync.md "Writing"), as values: what
// the grammar reads, what each operation answers, and the named refusals.

/** The most operations one changeset holds (default). */
export const TEXT_OPS_MAX = 200;
/** The most characters of operations one changeset holds, as an element changeset's edits (default). */
export const TEXT_OPS_MAX_CHARS = 40_000;

/** A paragraph by its number (`¶12`, `p12`), or the one paragraph holding a quoted text. */
export type TextTarget =
  | { readonly kind: 'paragraph'; readonly n: number }
  | { readonly kind: 'text'; readonly text: string };

export const TEXT_MARKS = ['bold', 'italic', 'underline', 'strike'] as const;
export type TextMarkName = (typeof TEXT_MARKS)[number];

/** A format operation's mark: one put on or taken off, or a link set or taken off (`href` null). */
export type TextMark =
  | { readonly mark: TextMarkName; readonly on: boolean }
  | { readonly mark: 'link'; readonly href: string | null };

export const TABLE_ACTIONS = ['add-row', 'delete-row', 'add-column', 'delete-column'] as const;
export type TableAction =
  | { readonly action: (typeof TABLE_ACTIONS)[number]; readonly n: number }
  | {
      readonly action: 'set';
      readonly row: number;
      readonly column: number;
      readonly text: string;
    };

export type TextOp =
  | { readonly op: 'edit'; readonly old: string; readonly text: string }
  | {
      readonly op: 'insert';
      readonly where: 'after' | 'before';
      readonly target: TextTarget;
      readonly markdown: string;
    }
  | { readonly op: 'append' | 'prepend'; readonly markdown: string }
  | { readonly op: 'style'; readonly target: TextTarget; readonly style: string }
  | { readonly op: 'format'; readonly old: string; readonly marks: readonly TextMark[] }
  | { readonly op: 'table'; readonly target: TextTarget; readonly action: TableAction }
  | { readonly op: 'comment'; readonly old: string; readonly text: string }
  | { readonly op: 'replace'; readonly markdown: string };

export type TextOpName = TextOp['op'];

/** The operations `suggest` may come before (agents-and-sync.md "The grammar", default). */
export const SUGGESTIBLE_OPS: readonly TextOpName[] = [
  'edit',
  'insert',
  'append',
  'prepend',
  'format',
];

/** One operation as written: its line in the text, its place among the operations, and whether it is suggested. */
export type TextOpLine = {
  readonly line: number;
  readonly operation: number;
  readonly suggest: boolean;
  readonly op: TextOp;
};

export const TEXT_OP_ERRORS = [
  'invalid_operation',
  'text_not_found',
  'text_ambiguous',
  'ref_not_found',
  'document_too_large',
  'stale_tab',
] as const;
export type TextOpError = (typeof TEXT_OP_ERRORS)[number];

/** A named refusal: the line and operation it names (0 for the changeset as a whole), and each match's paragraph. */
export type TextOpRejection = {
  readonly error: TextOpError;
  readonly line: number;
  readonly operation: number;
  readonly message: string;
  readonly paragraphs?: readonly number[];
};
