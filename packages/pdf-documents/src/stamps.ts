// The stamps LiveDoc draws (docs/specs/035-pdf-documents/marks.md "Stamps"): the standard's own, in the standard's
// names so other readers know them, LiveDoc's five more, and the dynamic ones that carry who placed them and when.
// Each with the words it shows, the name the file's `Name` holds, and the tone of its colour. Pure data.

/** The colour picker's strong tone a stamp is drawn in (marks.md "Stamps": A stamp's colour). */
export type StampTone = 'green' | 'red' | 'blue';

export type Stamp = {
  /** LiveDoc's id for it: the mark's `stamp`. */
  readonly id: string;
  /** Its words, as a person reads them; drawn in capitals. */
  readonly name: string;
  /** The file's `Name`: the standard's own for its fourteen, LiveDoc's for the rest. */
  readonly fileName: string;
  readonly tone: StampTone;
  /** Whether it carries a second line: who placed it and when. */
  readonly dynamic: boolean;
};

const standard = (id: string, name: string, fileName: string, tone: StampTone): Stamp => ({
  id,
  name,
  fileName,
  tone,
  dynamic: false,
});

const dynamic = (id: string, name: string, fileName: string, tone: StampTone): Stamp => ({
  id,
  name,
  fileName,
  tone,
  dynamic: true,
});

/** Every stamp, standard first, in the order the Stamp control shows them. */
export const STAMPS: readonly Stamp[] = [
  standard('approved', 'Approved', 'Approved', 'green'),
  standard('not-approved', 'Not approved', 'NotApproved', 'red'),
  standard('draft', 'Draft', 'Draft', 'blue'),
  standard('final', 'Final', 'Final', 'green'),
  standard('confidential', 'Confidential', 'Confidential', 'red'),
  standard('for-comment', 'For comment', 'ForComment', 'blue'),
  standard('for-public-release', 'For public release', 'ForPublicRelease', 'green'),
  standard('not-for-public-release', 'Not for public release', 'NotForPublicRelease', 'red'),
  standard('as-is', 'As is', 'AsIs', 'blue'),
  standard('expired', 'Expired', 'Expired', 'red'),
  standard('experimental', 'Experimental', 'Experimental', 'blue'),
  standard('departmental', 'Departmental', 'Departmental', 'blue'),
  standard('sold', 'Sold', 'Sold', 'green'),
  standard('top-secret', 'Top secret', 'TopSecret', 'red'),
  standard('sign-here', 'Sign here', 'SignHere', 'blue'),
  standard('initial-here', 'Initial here', 'InitialHere', 'blue'),
  standard('witness', 'Witness', 'Witness', 'blue'),
  standard('accepted', 'Accepted', 'Accepted', 'green'),
  standard('rejected', 'Rejected', 'Rejected', 'red'),
  dynamic('approved-by', 'Approved', 'Approved', 'green'),
  dynamic('received', 'Received', 'Received', 'blue'),
  dynamic('reviewed', 'Reviewed', 'Reviewed', 'blue'),
  dynamic('revised', 'Revised', 'Revised', 'blue'),
];

const BY_ID: ReadonlyMap<string, Stamp> = new Map(STAMPS.map((stamp) => [stamp.id, stamp]));

export const Stamps = {
  /** The stamp of an id; null for one LiveDoc does not draw. */
  of: (id: string): Stamp | null => BY_ID.get(id) ?? null,

  /** The standard stamps, then the dynamic ones, each in the control's order. */
  standard: STAMPS.filter((stamp) => !stamp.dynamic),
  dynamic: STAMPS.filter((stamp) => stamp.dynamic),
} as const;
