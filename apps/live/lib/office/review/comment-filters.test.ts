import { describe, expect, it } from 'vitest';
import type { Comment } from '@livedoc/document';
import {
  countLabel,
  filterRows,
  forYou,
  repliesLabel,
  ReviewFilters,
  type ReviewSelf,
  type ReviewThreadRow,
} from './comment-filters';

const comment = (id: string, authorId?: string): Comment => ({
  id,
  text: id,
  createdAt: 1,
  authorName: authorId ?? 'File',
  authorColor: '#000',
  ...(authorId ? { authorId } : {}),
});

const ME: ReviewSelf = { key: 'me', userId: 'u-me' };

const row = (id: string, over: Partial<ReviewThreadRow> = {}): ReviewThreadRow => ({
  id,
  label: 'quote',
  deleted: false,
  resolved: false,
  group: 't.0',
  comments: [comment(`${id}.1`, 'me')],
  ...over,
});

// docs/specs/034-text-documents/review.md "The comments panel": For you, replies after yours and mentions of you.
describe('forYou', () => {
  it('holds a thread where another replied after a comment of yours', () => {
    expect(forYou(row('a', { comments: [comment('1', 'me'), comment('2', 'them')] }), ME)).toBe(
      true,
    );
  });

  it('counts a file comment after yours as another', () => {
    expect(forYou(row('a', { comments: [comment('1', 'me'), comment('2')] }), ME)).toBe(true);
  });

  it('leaves a thread of yours alone without a reply after it', () => {
    expect(forYou(row('a', { comments: [comment('1', 'them'), comment('2', 'me')] }), ME)).toBe(
      false,
    );
  });

  it('leaves out a thread you never wrote in', () => {
    expect(forYou(row('a', { comments: [comment('1', 'them'), comment('2', 'x')] }), ME)).toBe(
      false,
    );
  });

  it('holds a thread with a comment that mentions you, by your account', () => {
    const mentioning = (userId: string | null): ReviewThreadRow =>
      row('a', {
        comments: [{ ...comment('1', 'them'), mentions: [{ userId, name: 'Me', handle: 'me' }] }],
      });
    expect(forYou(mentioning('u-me'), ME)).toBe(true);
    expect(forYou(mentioning('u-else'), ME)).toBe(false);
    expect(forYou(mentioning(null), { key: 'me', userId: null })).toBe(false);
  });

  it('holds nothing for a session without a key', () => {
    expect(
      forYou(row('a', { comments: [comment('1', ''), comment('2', 'x')] }), {
        key: '',
        userId: null,
      }),
    ).toBe(false);
  });
});

// docs/specs/012-collaboration/review-surfaces.md "The comments panel": the filters.
describe('filterRows', () => {
  const rows = [
    row('open'),
    row('done', { resolved: true }),
    row('other', { group: 't.b', comments: [comment('1', 'me'), comment('2', 'x')] }),
  ];
  const ids = (filters: ReviewFilters) => filterRows(rows, filters, ME).map((r) => r.id);

  it('keeps every row, in order, with the first filters', () => {
    expect(ids(ReviewFilters.initial)).toEqual(['open', 'done', 'other']);
  });

  it('keeps the open threads', () => {
    expect(ids({ ...ReviewFilters.initial, state: 'open' })).toEqual(['open', 'other']);
  });

  it('keeps the resolved threads', () => {
    expect(ids({ ...ReviewFilters.initial, state: 'resolved' })).toEqual(['done']);
  });

  it('keeps one group', () => {
    expect(ids({ ...ReviewFilters.initial, group: 't.b' })).toEqual(['other']);
  });

  it('keeps those for you', () => {
    expect(ids({ ...ReviewFilters.initial, who: 'for-you' })).toEqual(['other']);
  });
});

describe('the labels', () => {
  it('counts replies', () => {
    expect([0, 1, 2].map(repliesLabel)).toEqual(['', '1 reply', '2 replies']);
  });

  it('counts comments', () => {
    expect([0, 1, 3].map(countLabel)).toEqual(['0 comments', '1 comment', '3 comments']);
  });
});
