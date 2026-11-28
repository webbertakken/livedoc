import { describe, expect, it } from 'vitest';
import { isTextChangesetId } from './text-changesets';

describe('isTextChangesetId', () => {
  it('takes tc_ and ten Crockford characters only', () => {
    expect(isTextChangesetId('tc_0123456789')).toBe(true);
    expect(isTextChangesetId('tc_abcdefghjk')).toBe(true);
    expect(isTextChangesetId('sc_0123456789')).toBe(false);
    expect(isTextChangesetId('tc_012345678')).toBe(false);
    expect(isTextChangesetId('tc_01234567ul')).toBe(false);
    expect(isTextChangesetId(42)).toBe(false);
  });
});
