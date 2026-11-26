// A person's stamp identity (docs/specs/035-pdf-documents/marks.md "Stamps"): their title, organisation, unit and
// email, each optional, kept in their preferences and written only into the dynamic stamps they place. Unit and email
// are kept but never drawn: a stamp's third line is the title and the organisation. Pure.
import { PDF_STAMP_IDENTITY_FIELD_MAX_CHARS } from './limits';

/** The fields, in the order Manage stamps asks for them. */
export const STAMP_IDENTITY_FIELDS = ['title', 'organisation', 'unit', 'email'] as const;
export type StampIdentityField = (typeof STAMP_IDENTITY_FIELDS)[number];

export type StampIdentity = { readonly [field in StampIdentityField]?: string };

/** A field kept longer than `PDF_STAMP_IDENTITY_FIELD_MAX_CHARS`: read as not set. */
export type StampIdentityRefusal = {
  readonly field: StampIdentityField;
  readonly reason: 'stamp_identity_too_long';
};

export type StampIdentityRead = {
  readonly identity: StampIdentity;
  readonly refused: readonly StampIdentityRefusal[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const StampIdentity = {
  /** A stored identity, each field trimmed; an empty one unset, a longer one refused by name and unset. */
  read: (stored: unknown): StampIdentityRead => {
    if (!isRecord(stored)) return { identity: {}, refused: [] };
    const identity: Partial<Record<StampIdentityField, string>> = {};
    const refused: StampIdentityRefusal[] = [];
    for (const field of STAMP_IDENTITY_FIELDS) {
      const value = stored[field];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const text = value.trim();
      if (text.length > PDF_STAMP_IDENTITY_FIELD_MAX_CHARS)
        refused.push({ field, reason: 'stamp_identity_too_long' });
      else identity[field] = text;
    }
    return { identity, refused };
  },

  /** A dynamic stamp's third line: the title and the organisation set, joined; null for neither. */
  line: ({ title, organisation }: StampIdentity): string | null => {
    const shown = [title, organisation].filter((part): part is string => !!part);
    return shown.length > 0 ? shown.join(', ') : null;
  },

  /** The identity with one field set, trimmed and held to its limit; emptied, the field is unset. */
  set: (identity: StampIdentity, field: StampIdentityField, text: string): StampIdentity => {
    const { [field]: _was, ...rest } = identity;
    const kept = text.trim().slice(0, PDF_STAMP_IDENTITY_FIELD_MAX_CHARS).trim();
    return kept === '' ? rest : { ...rest, [field]: kept };
  },
} as const;
