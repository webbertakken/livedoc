// docs/specs/013-workspace/inbox.md §2.7: what an office document's threads put in the collaboration index.
import { describe, expect, it } from 'vitest';
import type { OfficeComment } from './office-comment';
import {
  drawnMentions,
  officeCollabRows,
  threadAssignment,
  type OfficeIndexThread,
} from './office-collab-rows';

const priya = { userId: 'u-priya', memberId: 'm-priya', name: 'Priya Kaur', handle: 'priya-kaur' };
const sam = { userId: null, memberId: 'm-sam', name: 'Sam Lee', handle: 'sam-lee' };

const comment = (
  id: string,
  at: number,
  key: string | undefined,
  extra: Partial<OfficeComment> = {},
): OfficeComment => ({
  id,
  text: `Text of ${id}`,
  at,
  author: key
    ? { key, name: `Name ${key}`, colour: '#123456' }
    : { name: 'Ada (file)', colour: '#6b7280', fromFile: true },
  ...extra,
});

const thread = (
  id: string,
  comments: OfficeComment[],
  extra: Partial<OfficeIndexThread> = {},
): OfficeIndexThread => ({
  id,
  label: 'the totals',
  resolved: false,
  comments,
  ...extra,
});

describe('drawnMentions', () => {
  it('keeps those with a name and handle, a file’s without an account', () => {
    expect(
      drawnMentions([priya, { name: 'Bo', handle: 'bo' }, { name: 3, handle: 'x' }, null, 'x']),
    ).toEqual([priya, { userId: null, name: 'Bo', handle: 'bo' }]);
    expect(drawnMentions(undefined)).toEqual([]);
  });
});

describe('threadAssignment', () => {
  it('is the latest comment that assigns, and its assignee', () => {
    const first = comment('c1', 1, 'k1', { mentions: [priya], assignee: priya });
    const second = comment('c2', 2, 'k2', { mentions: [sam], assignee: sam });
    const third = comment('c3', 3, 'k1');
    expect(threadAssignment({ comments: [first, second, third] })).toEqual({
      comment: second,
      assignee: sam,
    });
    expect(threadAssignment({ comments: [first, third] })?.assignee).toEqual(priya);
    expect(threadAssignment({ comments: [third] })).toBeNull();
  });
});

describe('officeCollabRows', () => {
  it('makes a thread row: label, count, keys in order, mentions, latest and first', () => {
    const rows = officeCollabRows(
      [
        thread('th1', [
          comment('c1', 10, 'k1', { mentions: [priya] }),
          comment('c2', 30, 'k2', { mentions: [sam, priya] }),
          comment('c3', 20, 'k1'),
          comment('c4', 5, undefined),
        ]),
      ],
      'team-1',
    );
    expect(rows.actions).toEqual([]);
    expect(rows.threads).toEqual([
      {
        elementId: 'th1',
        elementLabel: 'the totals',
        resolved: false,
        commentCount: 4,
        participantIds: ['k1', 'k2'],
        mentionedIds: ['u-priya', 'm-priya', 'm-sam'],
        latestText: 'Text of c2',
        latestAuthorName: 'Name k2',
        latestAuthorColor: '#123456',
        firstAt: 5,
        latestAt: 30,
      },
    ]);
  });

  it('takes the later comment as latest when two share a time', () => {
    const rows = officeCollabRows(
      [thread('th1', [comment('c1', 10, 'k1'), comment('c2', 10, 'k2')])],
      null,
    );
    expect(rows.threads[0]!.latestText).toBe('Text of c2');
  });

  it('gives a file’s comments no keys', () => {
    const rows = officeCollabRows([thread('th1', [comment('c1', 1, undefined)])], null);
    expect(rows.threads[0]!.participantIds).toEqual([]);
  });

  it('skips a thread with no comments', () => {
    expect(officeCollabRows([thread('th1', [])], null)).toEqual({ actions: [], threads: [] });
  });

  it('makes an action row for the current assignment, open while the thread is', () => {
    const assigning = comment('c2', 20, 'k2', {
      text: 'Check the totals\nand the dates',
      mentions: [sam],
      assignee: sam,
    });
    const threads = [
      thread('th1', [comment('c1', 10, 'k1'), assigning, comment('c3', 40, 'k1')], {
        label: 'May',
      }),
    ];
    const open = officeCollabRows(threads, 'team-1');
    expect(open.actions).toEqual([
      {
        elementId: 'th1',
        actionId: 'c2',
        elementLabel: 'May',
        name: 'Check the totals',
        description: 'Check the totals\nand the dates',
        status: 'open',
        assigneeUserId: null,
        assigneeMemberId: 'm-sam',
        assigneeName: 'Sam Lee',
        assignerId: 'k2',
        assignerName: 'Name k2',
        teamId: 'team-1',
        createdAt: 20,
        updatedAt: 40,
      },
    ]);
    const done = officeCollabRows([{ ...threads[0]!, resolved: true }], null);
    expect(done.actions[0]).toMatchObject({ status: 'done', teamId: null });
    expect(done.threads[0]!.resolved).toBe(true);
  });

  it('names no assigner for a file’s assigning comment', () => {
    const rows = officeCollabRows(
      [thread('th1', [comment('c1', 1, undefined, { mentions: [sam], assignee: sam })])],
      null,
    );
    expect(rows.actions[0]).toMatchObject({ assignerId: '', assignerName: 'Ada (file)' });
  });
});
