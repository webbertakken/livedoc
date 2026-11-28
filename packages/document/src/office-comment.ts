// A comment of an office document's thread (docs/specs/034-text-documents/review.md "How a comment is kept";
// docs/specs/029-sheets/review.md "Comments"): the one shape a text document's and a spreadsheet's threads hold, so
// the thread parts, the Inbox rows and the files read them alike. A LEAF module: types only.

/** Who wrote a comment: their adder key on the document, or a file's name for them with no key. */
export type OfficeCommentAuthor = {
  readonly key?: string;
  readonly name: string;
  /** A file's initials for them, where it had them. */
  readonly initials?: string;
  readonly colour: string;
  readonly fromFile?: true;
  /** A comparison's attribution, never anyone's own (review.md "Compare documents"). */
  readonly fromComparison?: true;
};

export type OfficeComment = {
  readonly id: string;
  readonly text: string;
  /** When it was made (ms); kept through edits. */
  readonly at: number;
  /** When it was last edited (ms). */
  readonly edited?: number;
  readonly author: OfficeCommentAuthor;
  readonly mentions?: readonly unknown[];
  readonly assignee?: unknown;
  /** Each emoji's reactors by key, sorted; an emoji with none is absent. */
  readonly reactions?: Readonly<Record<string, readonly string[]>>;
};
