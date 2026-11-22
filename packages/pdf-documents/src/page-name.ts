// A PDF page's name in the live changes (docs/specs/035-pdf-documents/live-editing-and-storage.md "The layout"): the
// page's object number in the stored file (`p:<n>`), which page operations never change, or a fresh id for an
// inserted page (`n:<id>`). A page number is where a name sits in the order, never an identity.

export type PageName = `p:${number}` | `n:${string}`;

const STORED = /^p:([1-9]\d{0,9})$/;
const INSERTED = /^n:[A-Za-z0-9_-]{1,64}$/;

export const PageName = {
  /** The name of the stored file's page held in that object. */
  ofObject: (objectNumber: number): PageName => `p:${objectNumber}`,
  /** The name, when the text is one; else null. */
  parse: (value: unknown): PageName | null =>
    typeof value === 'string' && (STORED.test(value) || INSERTED.test(value))
      ? (value as PageName)
      : null,
  /** The stored file's object number the name holds, or null for an inserted page. */
  objectNumber: (name: PageName): number | null => {
    const match = STORED.exec(name);
    return match ? Number(match[1]) : null;
  },
} as const;
