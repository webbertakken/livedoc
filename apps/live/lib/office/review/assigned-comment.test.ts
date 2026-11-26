// docs/specs/034-text-documents/review.md "Assigning": the label the card leads with, the offer the composer makes,
// and the action name the assignment email carries.
import { describe, expect, it } from 'vitest';
import { actionNameOf, assignedLabel, assignOffer, ACTION_NAME_MAX } from './assigned-comment';

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

describe('actionNameOf', () => {
  it('takes the first line, cut at a word with an ellipsis past the most', () => {
    expect(actionNameOf('Check the totals\nand the dates')).toBe('Check the totals');
    const long = `${'word '.repeat(60)}end`;
    const name = actionNameOf(long);
    expect(name.length).toBeLessThanOrEqual(ACTION_NAME_MAX);
    expect(name.endsWith('word…')).toBe(true);
    expect(actionNameOf('x'.repeat(300))).toHaveLength(ACTION_NAME_MAX);
  });
});
