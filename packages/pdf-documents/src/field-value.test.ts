import { describe, expect, it } from 'vitest';
import { FieldValue } from './field-value';
import {
  PDF_FIELD_NAME_MAX_CHARS,
  PDF_FIELD_OPTIONS_MAX,
  PDF_FIELD_VALUE_MAX_CHARS,
} from './limits';

const filled = { field: 'applicant.city', value: 'Delft', by: 'Ada', at: Date.UTC(2026, 10, 22) };

// fields.md "Filling"; live-editing-and-storage.md "A change and what takes it back"
describe('a field value', () => {
  it('holds the field’s full name, its value, who set it and when', () => {
    expect(FieldValue.parse(filled)).toEqual(filled);
  });

  it('holds the options chosen of a list that takes several, as its own list', () => {
    const chosen = ['Dutch', 'English'];
    const parsed = FieldValue.parse({ ...filled, value: chosen })!;
    expect(parsed.value).toEqual(chosen);
    expect(parsed.value).not.toBe(chosen);
  });

  it('cuts the name of who set it to what a name may be', () => {
    expect(FieldValue.parse({ ...filled, by: 'a'.repeat(999) })!.by).toHaveLength(255);
  });

  it('is none where a property is missing, of the wrong kind or past its limit', () => {
    for (const wrong of [
      null,
      'Delft',
      { ...filled, field: '' },
      { ...filled, field: 7 },
      { ...filled, field: 'f'.repeat(PDF_FIELD_NAME_MAX_CHARS + 1) },
      { ...filled, value: 7 },
      { ...filled, value: 'v'.repeat(PDF_FIELD_VALUE_MAX_CHARS + 1) },
      { ...filled, value: ['ok', 7] },
      { ...filled, value: Array.from({ length: PDF_FIELD_OPTIONS_MAX + 1 }, () => 'x') },
      { ...filled, by: null },
      { ...filled, at: -1 },
      { ...filled, at: 1.5 },
      { ...filled, at: '2026' },
      { ...filled, at: 9e15 },
    ])
      expect(FieldValue.parse(wrong)).toBeNull();
  });
});
