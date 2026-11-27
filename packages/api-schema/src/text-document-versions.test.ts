import { describe, expect, it } from 'vitest';
import { parseVersionAuthorLabel, parseVersionName } from './text-document-versions';

describe('parseVersionAuthorLabel', () => {
  it('reads a name and a colour', () => {
    expect(parseVersionAuthorLabel({ name: 'Ada', color: '#1a73e8' })).toEqual({
      name: 'Ada',
      color: '#1a73e8',
    });
  });

  it('drops what is malformed, never refusing', () => {
    expect(parseVersionAuthorLabel({ name: 'x'.repeat(65), color: 'blue' })).toEqual({
      name: null,
      color: null,
    });
    expect(parseVersionAuthorLabel(undefined)).toEqual({ name: null, color: null });
  });
});

describe('parseVersionName', () => {
  it('trims a name', () => {
    expect(parseVersionName({ name: '  Draft 1 ' }, 100)).toEqual({ ok: true, name: 'Draft 1' });
  });

  it('reads an empty name as none', () => {
    expect(parseVersionName({ name: '   ' }, 100)).toEqual({ ok: true, name: null });
  });

  it('refuses a name past the limit, and a body without one', () => {
    expect(parseVersionName({ name: 'x'.repeat(101) }, 100)).toEqual({
      ok: false,
      error: 'version_name_too_long',
    });
    expect(parseVersionName({}, 100)).toEqual({ ok: false, error: 'version_name_invalid' });
  });
});
