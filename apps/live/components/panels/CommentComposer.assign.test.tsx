// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Assigning": while the text names someone it mentions, a checkbox offers to
// assign the thread to the last of them picked; ticked, the comment is sent with them as its assignee. A composer
// with no `assign` (the canvas's) offers nothing.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentMention } from '@livedoc/document';
import { MentionContext } from '@/components/canvas/collab/comment/MentionContext';
import { CommentComposer } from './comment-thread-parts';

afterEach(cleanup);

const priya = { userId: 'u-priya', memberId: 'm-priya', name: 'Priya Kaur', handle: 'priya-kaur' };
const sam = { userId: null, memberId: 'm-sam', name: 'Sam Lee', handle: 'sam-lee' };

function composer(assign?: (m: CommentMention) => string | null) {
  const onAddComment = vi.fn();
  render(
    <MentionContext.Provider
      value={{
        candidates: [
          { ...priya, pending: false },
          { ...sam, pending: true },
        ],
        available: true,
      }}
    >
      <CommentComposer onAddComment={onAddComment} assign={assign} />
    </MentionContext.Provider>,
  );
  const field = screen.getByRole('textbox', { name: 'Add a comment' });
  const type = (value: string) =>
    fireEvent.change(field, {
      target: { value, selectionStart: value.length, selectionEnd: value.length },
    });
  const pick = (value: string) => {
    type(value);
    fireEvent.keyDown(field, { key: 'Enter' });
  };
  const send = () => fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
  return { onAddComment, type, pick, send };
}

const assignTo = (m: CommentMention) => `Assign to ${m.name}`;

describe('CommentComposer, assigning', () => {
  it('offers to assign the last person picked, unticked, once the text names them', () => {
    const { pick } = composer(assignTo);
    expect(screen.queryByRole('checkbox')).toBeNull();
    pick('@pri');
    pick('@priya-kaur and @sa');
    const box = screen.getByRole('checkbox', { name: 'Assign to Sam Lee' });
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it('sends the assignee when ticked, and none when not', () => {
    const { pick, send, onAddComment } = composer(assignTo);
    pick('@pri');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assign to Priya Kaur' }));
    send();
    expect(onAddComment).toHaveBeenLastCalledWith('@priya-kaur', [priya], priya);
    expect(screen.queryByRole('checkbox')).toBeNull();
    pick('@pri');
    send();
    expect(onAddComment).toHaveBeenLastCalledWith('@priya-kaur', [priya], undefined);
  });

  it('drops the offer once the handle leaves the text', () => {
    const { pick, type } = composer(assignTo);
    pick('@pri');
    type('nobody');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('offers nothing where the kind says no, or takes no assigning', () => {
    composer(() => null).pick('@pri');
    expect(screen.queryByRole('checkbox')).toBeNull();
    cleanup();
    composer().pick('@pri');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
