// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The comments panel"; review-surfaces.md "The comments panel": the filters,
// the rows (quote, first comment, replies, resolved with Reopen), the empty states, the count, the keys and the press.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@livedoc/document';
import { ReviewFilters, type ReviewThreadRow } from '@/lib/office/review/comment-filters';
import { OfficeCommentsPanel } from './OfficeCommentsPanel';

afterEach(cleanup);

const comment = (id: string, authorId: string | undefined, authorName: string): Comment => ({
  id,
  text: `${authorName} says ${id}`,
  createdAt: Date.now(),
  authorName,
  authorColor: '#0284c7',
  ...(authorId ? { authorId } : {}),
});

const ROWS: ReviewThreadRow[] = [
  {
    id: 'a',
    label: 'quarterly results',
    deleted: false,
    resolved: false,
    group: 't.0',
    comments: [comment('1', 'me', 'Ada'), comment('2', 'ben', 'Ben')],
  },
  {
    id: 'b',
    label: 'old words',
    deleted: true,
    resolved: true,
    group: 't.b',
    comments: [comment('3', 'ben', 'Ben')],
  },
];

function panel(
  extra: Partial<Parameters<typeof OfficeCommentsPanel>[0]> = {},
  rows: readonly ReviewThreadRow[] = ROWS,
) {
  const onGo = vi.fn();
  const onReopen = vi.fn();
  function Host() {
    const [filters, setFilters] = useState(ReviewFilters.initial);
    return (
      <OfficeCommentsPanel
        rows={rows}
        groups={[
          { id: 't.0', label: 'One' },
          { id: 't.b', label: 'Two' },
        ]}
        self={{ key: 'me', userId: null }}
        canComment
        filters={filters}
        onFilters={setFilters}
        onGo={onGo}
        onReopen={onReopen}
        addHint="Select some text and press ⌘⌥M to comment."
        {...extra}
      />
    );
  }
  render(<Host />);
  return { onGo, onReopen };
}

const goButtons = () => screen.getAllByRole('button', { name: /^Go to comment/ });

describe('OfficeCommentsPanel', () => {
  it('lists every thread with its quote, first comment, replies and resolved state', () => {
    panel();
    expect(goButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Go to comment by Ada on “quarterly results”',
      'Go to comment by Ben on “old words”',
    ]);
    expect(screen.getByText('quarterly results')).toBeTruthy();
    expect(screen.getByText('Ada says 1')).toBeTruthy();
    expect(screen.queryByText('Ben says 2')).toBeNull();
    expect(screen.getByText('1 reply')).toBeTruthy();
    expect(screen.getByText('Original content deleted')).toBeTruthy();
    expect(screen.getByText('Resolved', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('2 comments');
  });

  it('narrows by whose, which and the tab', () => {
    panel();
    fireEvent.change(screen.getByLabelText('Which comments'), { target: { value: 'open' } });
    expect(goButtons()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Which comments'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Which tab'), { target: { value: 't.b' } });
    expect(goButtons()[0]!.getAttribute('aria-label')).toContain('old words');
    fireEvent.change(screen.getByLabelText('Which tab'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Whose comments'), { target: { value: 'for-you' } });
    expect(goButtons()).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('1 comment');
  });

  it('offers the tab list only with more than one tab', () => {
    panel({ groups: [{ id: 't.0', label: 'One' }] });
    expect(screen.queryByLabelText('Which tab')).toBeNull();
  });

  it('reads a filter naming a tab that went as every tab', () => {
    panel({ filters: { ...ReviewFilters.initial, group: 't.gone' } });
    expect(goButtons()).toHaveLength(2);
  });

  it('goes to a thread when its row is pressed', () => {
    const { onGo } = panel();
    fireEvent.click(goButtons()[1]!);
    expect(onGo).toHaveBeenCalledWith('b');
  });

  it('reopens a resolved thread for whoever may comment, and never for a reader', () => {
    const { onReopen } = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen comment by Ben' }));
    expect(onReopen).toHaveBeenCalledWith('b');
    cleanup();
    panel({ canComment: false });
    expect(screen.queryByRole('button', { name: /Reopen/ })).toBeNull();
  });

  it('moves between rows with Up, Down, Home and End', () => {
    panel();
    const [first, second] = goButtons();
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first!, { key: 'End' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });

  it('says there are none yet, with the hint for whoever may comment', () => {
    panel({}, []);
    const list = screen.getByText('No comments yet').parentElement!;
    expect(within(list).getByText('Select some text and press ⌘⌥M to comment.')).toBeTruthy();
    cleanup();
    panel({ canComment: false }, []);
    expect(screen.queryByText(/press ⌘⌥M/)).toBeNull();
  });

  it('says none match when the filters let none through', () => {
    panel({ filters: { ...ReviewFilters.initial, who: 'for-you', state: 'resolved' } });
    expect(screen.getByText('No comments match')).toBeTruthy();
  });

  // review.md "Assigning": a row leads with whom its thread is assigned to.
  it('leads an assigned thread’s row with its assignee, you for the reader', () => {
    const priya = { userId: 'u-priya', name: 'Priya Kaur', handle: 'priya-kaur' };
    panel({}, [{ ...ROWS[0]!, assignee: priya }]);
    expect(screen.getByText('Assigned to Priya Kaur')).toBeTruthy();
    cleanup();
    panel({ self: { key: 'me', userId: 'u-priya' } }, [{ ...ROWS[0]!, assignee: priya }]);
    expect(screen.getByText('Assigned to you')).toBeTruthy();
  });

  it('marks a file’s comment', () => {
    panel({}, [{ ...ROWS[0]!, comments: [comment('9', undefined, 'Cy')] }]);
    expect(screen.queryByText('From the file')).toBeNull();
    cleanup();
    panel({ noteOf: () => 'From the file' }, [
      { ...ROWS[0]!, comments: [comment('9', undefined, 'Cy')] },
    ]);
    expect(screen.getByText('From the file')).toBeTruthy();
  });
});

// review.md "Suggestion cards", In the comments panel: a suggestion's row names who made it.
describe('OfficeCommentsPanel, a suggestion’s row', () => {
  it('names the suggestion and its maker, with its replies counted', () => {
    const row: ReviewThreadRow = {
      id: 'suggestion:s1',
      label: '',
      deleted: false,
      resolved: false,
      group: 't.0',
      kind: 'suggestion',
      comments: [
        { ...comment('suggestion:s1', 'ben', 'Ben'), text: 'Add: “quick”' },
        comment('r1', 'me', 'Ada'),
      ],
    };
    const { onGo } = panel({}, [row]);
    fireEvent.click(screen.getByRole('button', { name: 'Go to suggestion by Ben' }));
    expect(onGo).toHaveBeenCalledWith('suggestion:s1');
    expect(screen.getByText('Add: “quick”')).toBeTruthy();
    expect(screen.getByText('1 reply')).toBeTruthy();
  });
});
