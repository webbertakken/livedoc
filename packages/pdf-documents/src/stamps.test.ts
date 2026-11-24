// marks.md "Stamps": the standard's fourteen in its names, LiveDoc's five more, four dynamic ones; each a colour's tone.
import { describe, expect, it } from 'vitest';
import { STAMPS, Stamps } from './stamps';

describe('the stamps', () => {
  it('holds the standard stamps under the standard’s names, then the dynamic ones', () => {
    expect(Stamps.standard.map((stamp) => stamp.fileName)).toEqual([
      'Approved',
      'NotApproved',
      'Draft',
      'Final',
      'Confidential',
      'ForComment',
      'ForPublicRelease',
      'NotForPublicRelease',
      'AsIs',
      'Expired',
      'Experimental',
      'Departmental',
      'Sold',
      'TopSecret',
      'SignHere',
      'InitialHere',
      'Witness',
      'Accepted',
      'Rejected',
    ]);
    expect(Stamps.dynamic.map((stamp) => stamp.name)).toEqual([
      'Approved',
      'Received',
      'Reviewed',
      'Revised',
    ]);
  });

  it('gives each stamp an id of its own and the tone the spec names', () => {
    expect(new Set(STAMPS.map((stamp) => stamp.id)).size).toBe(STAMPS.length);
    const tone = (tone: string) =>
      Stamps.standard.filter((stamp) => stamp.tone === tone).map((stamp) => stamp.name);
    expect(tone('green')).toEqual(['Approved', 'Final', 'For public release', 'Sold', 'Accepted']);
    expect(tone('red')).toEqual([
      'Not approved',
      'Confidential',
      'Not for public release',
      'Expired',
      'Top secret',
      'Rejected',
    ]);
  });

  it('finds a stamp by its id, and none for an id it does not hold', () => {
    expect(Stamps.of('approved-by')).toMatchObject({ name: 'Approved', dynamic: true });
    expect(Stamps.of('paid')).toBeNull();
  });
});
