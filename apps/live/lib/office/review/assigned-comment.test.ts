// docs/specs/034-text-documents/review.md "Assigning": the label the card leads with and the offer the composer makes.
import { describe, expect, it } from 'vitest';
import { assignedLabel, assignOffer } from './assigned-comment';

const priya = { userId: 'u-priya', memberId: 'm-priya', name: 'Priya Kaur', handle: 'priya-kaur' };
const sam = { userId: null, memberId: 'm-sam', name: 'Sam Lee', handle: 'sam-lee' };

describe('assignedLabel', () => {
  it('names the assignee, or the reader as you', () => {
    expect(assignedLabel(priya, null)).toBe('Assigned to Priya Kaur');
    expect(assignedLabel(priya, 'u-priya')).toBe('Assigned to you');
    expect(assignedLabel(sam, 'u-priya')).toBe('Assigned to Sam Lee');
  });
});

describe('assignOffer', () => {
  it('offers to assign on an unassigned thread, to reassign on an assigned one, and nothing for the same person', () => {
    expect(assignOffer(null)(priya)).toBe('Assign to Priya Kaur');
    expect(assignOffer(priya)(sam)).toBe('Reassign to Sam Lee');
    expect(assignOffer(priya)({ ...priya })).toBeNull();
    expect(assignOffer(sam)({ ...sam })).toBeNull();
    expect(
      assignOffer({ userId: null, name: 'Bo', handle: 'bo' })({ ...sam, handle: 'bo' }),
    ).toBeNull();
  });
});

