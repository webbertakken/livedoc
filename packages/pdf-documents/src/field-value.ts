// A field value (docs/specs/035-pdf-documents/fields.md "Filling", live-editing-and-storage.md "A change and what
// takes it back"): what a person filled into one of a PDF's fields, held in the live changes by the field's full
// name and written into the file by the bake. A value object: made and checked here.
import {
  PDF_FIELD_NAME_MAX_CHARS,
  PDF_FIELD_OPTIONS_MAX,
  PDF_FIELD_VALUE_MAX_CHARS,
  PDF_NAME_MAX_CHARS,
} from './limits';

export type FieldValue = {
  /** The field's full name in the file's field tree ("applicant.address.city"). */
  readonly field: string;
  /** The value as text; the options chosen, for a list that takes several. */
  readonly value: string | readonly string[];
  /** The display name of who set it. */
  readonly by: string;
  /** When, in milliseconds since the epoch. */
  readonly at: number;
};

/** A JavaScript date's own range. */
const TIME_MAX = 8.64e15;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= PDF_FIELD_VALUE_MAX_CHARS;

export const FieldValue = {
  /**
   * The field value a value holds, or null: every property is checked and bounded, since a value arrives from other
   * people's browsers (security.md "Abuse cases").
   */
  parse: (value: unknown): FieldValue | null => {
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.field !== 'string' || v.field === '') return null;
    if (v.field.length > PDF_FIELD_NAME_MAX_CHARS) return null;
    const several = Array.isArray(v.value);
    if (several && (v.value as unknown[]).length > PDF_FIELD_OPTIONS_MAX) return null;
    if (several ? !(v.value as unknown[]).every(isText) : !isText(v.value)) return null;
    if (typeof v.by !== 'string') return null;
    if (typeof v.at !== 'number' || !Number.isInteger(v.at) || v.at < 0 || v.at > TIME_MAX)
      return null;
    return {
      field: v.field,
      value: several ? [...(v.value as string[])] : (v.value as string),
      by: v.by.slice(0, PDF_NAME_MAX_CHARS),
      at: v.at,
    };
  },
} as const;
