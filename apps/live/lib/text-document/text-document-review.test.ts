// docs/specs/034-text-documents/review.md "Reviewing suggestions": the count of the whole document and of each tab
// holding any; Previous and Next through the shown tab, then on to the next or previous tab holding any.
import { describe, expect, it } from 'vitest';
import { reviewCount, reviewCountLine, reviewStepTarget } from './text-document-review';

const TABS = [
  { id: 't.0', name: 'Tab 1' },
  { id: 't.1', name: 'Notes' },
  { id: 't.2', name: 'Appendix' },
];
const LIST = [
  { id: 'a', tab: 't.0' },
  { id: 'b', tab: 't.0' },
  { id: 'c', tab: 't.2' },
];

describe('reviewCount', () => {
  it('counts the whole document and each tab holding any, in the tabs’ order', () => {
    expect(reviewCount(LIST, TABS)).toEqual({
      total: 3,
      tabs: [
        { id: 't.0', name: 'Tab 1', count: 2 },
        { id: 't.2', name: 'Appendix', count: 1 },
      ],
    });
  });

  it('says the count as the panel does', () => {
    expect(reviewCountLine(0)).toBe('No suggested edits');
    expect(reviewCountLine(1)).toBe('1 suggested edit');
    expect(reviewCountLine(3)).toBe('3 suggested edits');
  });
});

describe('reviewStepTarget', () => {
  const tabs = TABS.map((t) => t.id);

  it('takes the shown tab’s next or previous first', () => {
    expect(reviewStepTarget(LIST, tabs, 't.0', 'b', true)).toEqual({ id: 'b', tab: 't.0' });
  });

  it('goes on to the next tab holding any past the shown tab’s last, and back before its first', () => {
    expect(reviewStepTarget(LIST, tabs, 't.0', null, true)).toEqual({ id: 'c', tab: 't.2' });
    expect(reviewStepTarget(LIST, tabs, 't.2', null, false)).toEqual({ id: 'b', tab: 't.0' });
    expect(reviewStepTarget(LIST, tabs, 't.1', null, false)).toEqual({ id: 'b', tab: 't.0' });
  });

  it('moves nothing past the last or before the first', () => {
    expect(reviewStepTarget(LIST, tabs, 't.2', null, true)).toBeNull();
    expect(reviewStepTarget(LIST, tabs, 't.0', null, false)).toBeNull();
  });
});
