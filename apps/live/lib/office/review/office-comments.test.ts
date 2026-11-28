// docs/specs/034-text-documents/review.md "How a comment is kept", "Mentions", "Assigning"; docs/specs/029-sheets/review.md
// "Comments": an office comment in the shared shape, the line under a file's author, a thread's assignee.
import { describe, expect, it } from 'vitest';
import type { OfficeComment } from '@livedoc/document';
import { authorNoteOf, commentNoteOf, sharedComment, threadAssignee } from './office-comments';

const ADA: OfficeComment = {
  id: 'c',
  text: 'hm',
  at: 1,
  author: { key: 'k', name: 'Ada', colour: '#0284c7' },
};

describe('sharedComment', () => {
  it('carries the key as the author id and a file’s comment as from the file', () => {
    expect(sharedComment(ADA)).toMatchObject({ authorId: 'k', authorName: 'Ada' });
    const file = sharedComment({
      ...ADA,
      author: { name: 'Bo', colour: '#6b7280', fromFile: true },
    });
    expect(file.authorId).toBeUndefined();
    expect(commentNoteOf(file)).toBe('From the file');
    expect(commentNoteOf(sharedComment(ADA))).toBeNull();
  });

  // review.md "Suggestion cards": a comparison's author reads "From the comparison".
  it('says From the comparison under a comparison’s author', () => {
    expect(authorNoteOf({ fromComparison: true })).toBe('From the comparison');
    expect(authorNoteOf({ fromFile: true })).toBe('From the file');
    expect(authorNoteOf({})).toBeNull();
  });

  // review.md "Mentions": the chips are drawn from the comment's mentions, a file's (no account) too; a malformed one
  // is left out.
  it('carries the mentions a chip is drawn from, a file’s too, and leaves out a malformed one', () => {
    const priya = {
      userId: 'u-priya',
      memberId: 'm-priya',
      name: 'Priya Kaur',
      handle: 'priya-kaur',
    };
    const fromFile = { userId: null, name: 'Bo Lee', handle: 'bo-lee' };
    expect(
      sharedComment({ ...ADA, mentions: [priya, fromFile, { handle: 7 }, 'x'] }).mentions,
    ).toEqual([priya, fromFile]);
    expect(sharedComment({ ...ADA, mentions: [] }).mentions).toBeUndefined();
    expect(sharedComment(ADA).mentions).toBeUndefined();
  });
});

// review.md "Assigning": a thread is assigned to the assignee of its latest comment that carries one.
describe('threadAssignee', () => {
  const priya = {
    userId: 'u-priya',
    memberId: 'm-priya',
    name: 'Priya Kaur',
    handle: 'priya-kaur',
  };
  const sam = { userId: null, memberId: 'm-sam', name: 'Sam Lee', handle: 'sam-lee' };
  const thread = (...assignees: unknown[]) => ({
    comments: assignees.map((assignee, i) => ({
      ...ADA,
      id: String(i),
      ...(assignee === undefined ? {} : { assignee }),
    })),
  });

  it('takes the latest comment’s assignee, skipping those with none', () => {
    expect(threadAssignee(thread(priya, sam, undefined))).toEqual(sam);
    expect(threadAssignee(thread(undefined))).toBeNull();
    expect(threadAssignee(thread(priya, { name: 7 }))).toEqual(priya);
  });
});
