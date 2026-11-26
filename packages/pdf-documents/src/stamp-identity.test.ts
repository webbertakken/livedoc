// marks.md "Stamps": a person's stamp identity, read from their preferences, and the third line it gives a dynamic
// stamp.
import { describe, expect, it } from 'vitest';
import { PDF_STAMP_IDENTITY_FIELD_MAX_CHARS } from './limits';
import { StampIdentity } from './stamp-identity';

describe('StampIdentity.read', () => {
  it('reads nothing stored as no identity', () => {
    expect(StampIdentity.read(undefined)).toEqual({ identity: {}, refused: [] });
    expect(StampIdentity.read('Chief')).toEqual({ identity: {}, refused: [] });
    expect(StampIdentity.read([])).toEqual({ identity: {}, refused: [] });
  });

  it('reads each field, trimmed, and leaves an empty or non-text one unset', () => {
    const read = StampIdentity.read({
      title: '  Chief Engineer ',
      organisation: 'Analytical Ltd',
      unit: '   ',
      email: 42,
      other: 'ignored',
    });
    expect(read).toEqual({
      identity: { title: 'Chief Engineer', organisation: 'Analytical Ltd' },
      refused: [],
    });
  });

  it('refuses a field kept longer than its limit by name, and reads it as not set', () => {
    const long = 'a'.repeat(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS + 1);
    expect(StampIdentity.read({ title: long, email: 'ada@example.org' })).toEqual({
      identity: { email: 'ada@example.org' },
      refused: [{ field: 'title', reason: 'stamp_identity_too_long' }],
    });
    const most = 'a'.repeat(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS);
    expect(StampIdentity.read({ unit: most }).identity).toEqual({ unit: most });
  });
});

describe('StampIdentity.line', () => {
  it('joins the title and the organisation set', () => {
    expect(StampIdentity.line({ title: 'Chief Engineer', organisation: 'Analytical Ltd' })).toBe(
      'Chief Engineer, Analytical Ltd',
    );
    expect(StampIdentity.line({ title: 'Chief Engineer' })).toBe('Chief Engineer');
    expect(StampIdentity.line({ organisation: 'Analytical Ltd' })).toBe('Analytical Ltd');
  });

  it('gives no line for neither: unit and email are never drawn', () => {
    expect(StampIdentity.line({})).toBeNull();
    expect(StampIdentity.line({ unit: 'Engines', email: 'ada@example.org' })).toBeNull();
  });
});

describe('StampIdentity.set', () => {
  it('sets a field trimmed, and clears it when emptied', () => {
    const set = StampIdentity.set({ title: 'Chief' }, 'organisation', '  Analytical Ltd ');
    expect(set).toEqual({ title: 'Chief', organisation: 'Analytical Ltd' });
    expect(StampIdentity.set(set, 'title', '   ')).toEqual({ organisation: 'Analytical Ltd' });
  });

  it('holds a field to its limit', () => {
    const set = StampIdentity.set({}, 'email', 'e'.repeat(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS + 9));
    expect(set.email).toHaveLength(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS);
  });
});
