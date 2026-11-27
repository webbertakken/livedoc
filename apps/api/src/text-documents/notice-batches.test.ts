import { describe, expect, it } from 'vitest';
import type { TextDocumentComment, TextDocumentThread } from '@livedoc/text-documents';
import {
  commentCountBucket,
  commentsFor,
  newCommentsSince,
  noticeCandidates,
  noticeComments,
  noticeKeys,
} from './notice-batches';

// docs/specs/034-text-documents/review.md "Notifications": what each person's email holds.

const mention = (userId: string) => ({ userId, name: userId, handle: userId });

function comment(id: string, key: string, extra: Partial<TextDocumentComment> = {}) {
  return {
    id,
    text: `text ${id}`,
    at: Number(id.replace(/\D/g, '')) || 0,
    author: { key, name: `Name ${key}`, colour: '#000' },
    ...extra,
  } satisfies TextDocumentComment;
}

function thread(id: string, comments: TextDocumentComment[], resolved = false): TextDocumentThread {
  return {
    id,
    tab: 'body',
    start: new Uint8Array(),
    end: new Uint8Array(),
    quote: `quote ${id}`,
    resolved,
    comments,
  };
}

const owners = new Map([
  ['k-ada', 'ada'],
  ['k-bo', 'bo'],
  ['k-cy', 'cy'],
]);

describe('new comments in a window', () => {
  it('are those not held as it opened, on open threads only', () => {
    const threads = [
      thread('t1', [comment('c1', 'k-ada'), comment('c2', 'k-bo')]),
      thread('t2', [comment('c3', 'k-bo')], true),
      thread('t3', [comment('c4', 'k-cy')]),
    ];
    const fresh = newCommentsSince('tab', threads, new Set(['c1']));
    expect(fresh.map((n) => n.comment.id)).toEqual(['c2', 'c4']);
    expect(fresh[0]!.tabId).toBe('tab');
  });

  it('leave out a comment deleted inside the window, as it is no longer there', () => {
    expect(
      newCommentsSince('tab', [thread('t1', [comment('c1', 'k-ada')])], new Set()),
    ).toHaveLength(1);
    expect(newCommentsSince('tab', [], new Set())).toEqual([]);
  });

  it('name every author key of their threads', () => {
    const fresh = newCommentsSince(
      'tab',
      [
        thread('t1', [
          comment('c1', 'k-ada'),
          comment('c2', 'k-bo'),
          { ...comment('c3', ''), author: { name: 'File', colour: '#000' } },
        ]),
      ],
      new Set(['c1']),
    );
    expect([...noticeKeys(fresh)].sort()).toEqual(['k-ada', 'k-bo']);
  });
});

describe('a new comment, as accounts', () => {
  it('says who wrote it, whom it names and whom its thread involves', () => {
    const fresh = newCommentsSince(
      'tab',
      [
        thread('t1', [
          comment('c1', 'k-ada', { mentions: [mention('dee')] }),
          comment('c2', 'k-bo', { mentions: [mention('eve')], assignee: mention('eve') }),
          comment('c3', 'k-unknown'),
        ]),
      ],
      new Set(['c1']),
    );
    const [c2, c3] = noticeComments(fresh, owners);
    expect(c2).toMatchObject({
      threadId: 't1',
      quote: 'quote t1',
      commentId: 'c2',
      text: 'text c2',
      authorName: 'Name k-bo',
      authorId: 'bo',
    });
    expect([...c2!.namedIds]).toEqual(['eve']);
    expect([...c2!.involved].sort()).toEqual(['ada', 'bo', 'dee', 'eve']);
    expect(c3!.authorId).toBeNull();
  });
});

describe('who hears of them', () => {
  const notices = noticeComments(
    newCommentsSince(
      'tab',
      [
        thread('t1', [comment('c1', 'k-ada'), comment('c2', 'k-bo')]),
        thread('t2', [comment('c4', 'k-cy', { mentions: [mention('ada')] })]),
        thread('t3', [comment('c3', 'k-bo')]),
      ],
      new Set(['c1']),
    ),
    owners,
  );

  it('are the people involved and those who asked for all', () => {
    expect(
      noticeCandidates(notices, [
        { ownerId: 'zed', comments: 'all', edits: 'none' },
        { ownerId: 'yan', comments: 'for-you', edits: 'none' },
      ]),
    ).toEqual(['ada', 'bo', 'cy', 'zed']);
  });

  it('give all comments to All, never their own, oldest first', () => {
    const all = { comments: 'all', edits: 'none' } as const;
    expect(commentsFor('zed', all, notices).map((n) => n.commentId)).toEqual(['c2', 'c3', 'c4']);
    expect(commentsFor('bo', all, notices).map((n) => n.commentId)).toEqual(['c4']);
  });

  it('give Comments for you the threads that involve them, less a comment that named them', () => {
    const forYou = { comments: 'for-you', edits: 'none' } as const;
    // ada started t1; c4 mentions her, and that mention emailed her at once.
    expect(commentsFor('ada', forYou, notices).map((n) => n.commentId)).toEqual(['c2']);
    expect(commentsFor('zed', forYou, notices)).toEqual([]);
  });

  it('give None nothing', () => {
    expect(commentsFor('ada', { comments: 'none', edits: 'none' }, notices)).toEqual([]);
  });

  it('order comments of one moment by id', () => {
    const same = notices.map((n) => ({ ...n, at: 1 }));
    expect(
      commentsFor('zed', { comments: 'all', edits: 'none' }, [...same].reverse()).map(
        (n) => n.commentId,
      ),
    ).toEqual(['c2', 'c3', 'c4']);
  });
});

describe('the telemetry bucket', () => {
  it('counts one, two to five, and six or more', () => {
    expect([1, 2, 5, 6, 40].map(commentCountBucket)).toEqual([
      'One',
      'TwoToFive',
      'TwoToFive',
      'SixPlus',
      'SixPlus',
    ]);
  });
});
