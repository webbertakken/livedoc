// A field of a file's interactive form, as read (docs/specs/035-pdf-documents/fields.md "What a file's fields are"):
// one place a field shows on a page, with what the file says of the field. A field may show in several places; all
// carry its one full name.
export type PdfFieldType =
  'text' | 'tick-box' | 'radio' | 'dropdown' | 'list' | 'button' | 'signature';

export type FieldOption = { readonly label: string; readonly chosen: boolean };

export type PageField = {
  /** The field's full name in the file's field tree ("applicant.address.city"). */
  readonly name: string;
  readonly type: PdfFieldType;
  /** This place's box in page space: left, bottom, right, top. */
  readonly rect: readonly [number, number, number, number];
  /** The field's value as text; always empty for a password field, a button and a signature field. */
  readonly value: string;
  /** Whether this tick box or radio button is on; null for every other type. */
  readonly on: boolean | null;
  /** What this tick box or radio button stands for when on; empty for every other type. */
  readonly onValue: string;
  /** A dropdown's or a list's options, in the file's order. */
  readonly options: readonly FieldOption[];
  /** The label the file gives the field for people; empty where it gives none. */
  readonly label: string;
  readonly readOnly: boolean;
  readonly required: boolean;
  /** Not shown, as the file says. */
  readonly hidden: boolean;
  readonly multiline: boolean;
  readonly password: boolean;
  /** A list that takes several options. */
  readonly severalChoices: boolean;
  /** A dropdown that takes a value of one's own. */
  readonly ownValue: boolean;
};
