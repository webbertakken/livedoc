import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentCommentThread } from '@livedoc/api-schema';

// The reading pane's verbs (docs/specs/013-workspace/inbox.md Â§1.5): which a row is offered, and the comment calls
// behind Reply and Resolve.

const api = vi.hoisted(() => ({
  apiAddComment: vi.fn(),
  apiListCommentThreads: vi.fn(),
  apiSetThreadResolved: vi.fn(),
}));
vi.mock('@/lib/api-client', () => api);

import { inboxEntries } from './inbox-entries';
import { offeredVerbs, readThread, replyToThread, resolveThread } from './inbox-verbs';
import { action, card, cardThread, feedOf, form, thread } from './inbox-test-utils';

const only = (feed: Parameters<typeof inboxEntries>[0]) => inboxEntries(feed)[0]!;
const done = { documentId: 'd1', tabId: 't1', markDone: vi.fn() };

const listed = (over: Partial<DocumentCommentThread> = {}): DocumentCommentThread => ({
  tabId: 't1',
  tabName: 'Flow',
  elementId: 'e9',
  ref: 'shape:e9',
  label: 'Gateway',
  resolved: false,
  comments: [
    { id: 'c-first', text: 'Hi', createdAt: 1, authorName: 'Priya', authorColor: '#336699' },
    {
      id: 'c-second',
      text: 'Any news?',
      createdAt: 2,
      authorName: 'Priya',
      authorColor: '#336699',
    },
  ],
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('offeredVerbs', () => {
  it('offers Reply and Resolve on an element thread the reader may comment on', () => {
    expect(
      offeredVerbs(only(feedOf({ threads: [{ kind: 'thread', ...thread() }] })), null),
    ).toEqual(['reply', 'resolve']);
  });

  it('offers nothing on a thread reached through a view link', () => {
    const e = only(feedOf({ threads: [{ kind: 'thread', ...thread({ canComment: false }) }] }));
    expect(offeredVerbs(e, done)).toEqual([]);
  });

  it('offers Mark Done only on an action of the tab the editor has open', () => {
    const mine = only(feedOf({ assignedToMe: [{ kind: 'action', ...action() }] }));
    expect(offeredVerbs(mine, done)).toEqual(['done']);
    expect(offeredVerbs(mine, null)).toEqual([]);
    expect(offeredVerbs(mine, { ...done, tabId: 't2' })).toEqual([]);
    expect(offeredVerbs(mine, { ...done, documentId: 'd9' })).toEqual([]);
    const theirs = only(
      feedOf({ youAssigned: [action({ assignedToMe: false, createdByMe: true })] }),
    );
    expect(offeredVerbs(theirs, done)).toEqual(['done']);
  });

  it('offers nothing on a row in This Browser', () => {
    const local = only(feedOf({ threads: [{ kind: 'thread', ...thread(), local: true }] }));
    expect(offeredVerbs(local, done)).toEqual([]);
    const localAction = only(
      feedOf({ assignedToMe: [{ kind: 'action', ...action(), local: true }] }),
    );
    expect(offeredVerbs(localAction, done)).toEqual([]);
  });

  it('offers nothing on a text document’s thread or assigned comment (D229)', () => {
    const text = only(
      feedOf({ threads: [{ kind: 'thread', ...thread({ anchor: 'text' }) }] }),
    );
    expect(offeredVerbs(text, done)).toEqual([]);
    const assigned = only(
      feedOf({ assignedToMe: [{ kind: 'action', ...action({ anchor: 'text' }) }] }),
    );
    expect(offeredVerbs(assigned, done)).toEqual([]);
  });

  it('offers nothing on a Plan card, a card thread or a form', () => {
    expect(
      offeredVerbs(only(feedOf({ assignedToMe: [{ kind: 'card', ...card() }] })), done),
    ).toEqual([]);
    expect(
      offeredVerbs(only(feedOf({ threads: [{ kind: 'card', ...cardThread() }] })), done),
    ).toEqual([]);
    expect(offeredVerbs(only(feedOf({ formResponses: [form()] })), done)).toEqual([]);
  });
});

describe('the comment calls', () => {
  const row = thread({ shareCode: 'code-1' });

  it('reads the rowâs own thread, never a cellâs, through the share code', async () => {
    api.apiListCommentThreads.mockResolvedValue([
      listed({ cell: 'r1:c1', comments: [] }),
      listed({ elementId: 'other' }),
      listed(),
    ]);
    expect((await readThread('me', row))?.comments[0]?.id).toBe('c-first');
    expect(api.apiListCommentThreads).toHaveBeenCalledWith('me', 'd1', 'open', 'code-1', undefined);
  });

  it('reads null when the thread is no longer open', async () => {
    api.apiListCommentThreads.mockResolvedValue([listed({ elementId: 'other' })]);
    expect(await readThread('me', row)).toBeNull();
  });

  it('replies on the elementâs own thread', async () => {
    api.apiAddComment.mockResolvedValue({ id: 'c3' });
    await replyToThread('me', row, 'On it');
    expect(api.apiAddComment).toHaveBeenCalledWith('me', 'd1', 't1', 'e9', 'On it', 'code-1');
  });

  it('resolves the thread named by its first comment', async () => {
    await resolveThread('me', row, listed());
    expect(api.apiSetThreadResolved).toHaveBeenCalledWith(
      'me',
      'd1',
      't1',
      'c-first',
      true,
      'code-1',
    );
  });

  it('reads the thread first when the pane has not, and refuses one that is gone', async () => {
    api.apiListCommentThreads.mockResolvedValueOnce([listed()]);
    await resolveThread('me', row, null);
    expect(api.apiSetThreadResolved).toHaveBeenCalledTimes(1);
    api.apiListCommentThreads.mockResolvedValueOnce([]);
    await expect(resolveThread('me', row, null)).rejects.toThrow('thread_gone');
  });
});
