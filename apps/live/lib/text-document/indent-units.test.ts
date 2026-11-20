// docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents": the dialog's units and fields.
import { describe, expect, it } from 'vitest';
import { indentUnit, INDENT_FIELD_MAX, ptOf, readIndentField, unitOf } from './indent-units';

describe('indent units', () => {
  it('shows inches for American English, centimetres elsewhere', () => {
    expect(indentUnit('en-US')).toBe('in');
    expect(indentUnit('en-GB')).toBe('cm');
    expect(indentUnit('nl')).toBe('cm');
    expect(indentUnit('')).toBe('cm');
  });

  it('turns points into the unit and back', () => {
    expect(unitOf(36, 'in')).toBe(0.5);
    expect(unitOf(36, 'cm')).toBe(1.27);
    expect(ptOf(1.27, 'cm')).toBeCloseTo(36);
    expect(ptOf(0.5, 'in')).toBe(36);
  });

  it('reads a field: a number, blank as no change, and refuses what lies outside 0 to its most', () => {
    expect(readIndentField(' 1,5 ', 'cm')).toBe(1.5);
    expect(readIndentField('', 'cm')).toBeNull();
    expect(readIndentField('-1', 'cm')).toBe('invalid');
    expect(readIndentField('abc', 'in')).toBe('invalid');
    expect(readIndentField(String(INDENT_FIELD_MAX.cm), 'cm')).toBe(55.88);
    expect(readIndentField('22.01', 'in')).toBe('invalid');
  });
});
