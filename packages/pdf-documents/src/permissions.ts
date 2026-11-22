// What a PDF's permissions ask of a reader (docs/specs/035-pdf-documents/opening.md "Passwords";
// redaction-and-protection.md "Protection"): seven answers read from the standard's permission bits (ISO 32000-2,
// table 22). They are a request, never a lock; LiveDoc honours them. Text for screen readers is always allowed.

export type PdfPermissions = {
  /** Printing at all. */
  readonly print: boolean;
  /** Printing at full resolution; never where printing is not allowed. */
  readonly printSharp: boolean;
  /** Changing page content: what Editing does to text, pictures and shapes. */
  readonly changeContent: boolean;
  /** Copying text and pictures. */
  readonly copy: boolean;
  /** Marks, and with them filling and signing. */
  readonly mark: boolean;
  /** Filling fields and signing, where marks are not allowed. */
  readonly fill: boolean;
  /** Inserting, deleting and rotating pages. */
  readonly organise: boolean;
};

// The standard counts its bits from 1.
const has = (bits: number, bit: number): boolean => (bits & (1 << (bit - 1))) !== 0;

export const PdfPermissions = {
  /** What a file with no protection asks: nothing. */
  all: (): PdfPermissions => ({
    print: true,
    printSharp: true,
    changeContent: true,
    copy: true,
    mark: true,
    fill: true,
    organise: true,
  }),
  /** The answers in the file's 32 permission bits, signed or unsigned. */
  of: (bits: number): PdfPermissions => {
    const print = has(bits, 3);
    const mark = has(bits, 6);
    return {
      print,
      printSharp: print && has(bits, 12),
      changeContent: has(bits, 4),
      copy: has(bits, 5),
      mark,
      fill: mark || has(bits, 9),
      organise: has(bits, 11),
    };
  },
  /** Whether the file asks nothing of its reader. */
  asksNothing: (permissions: PdfPermissions): boolean =>
    Object.values(permissions).every((allowed) => allowed),
} as const;
