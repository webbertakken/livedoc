// docs/specs/029-sheets/review.md "Comments": a spreadsheet's threads, one op a write, judged for who may make it.
import { describe, expect, it } from 'vitest';
import {
  applyThreadOp,
  readThreadOp,
  SHEET_COMMENT_TEXT_MAX,
  SHEET_REACTIONS_MAX,
  SHEET_THREAD_COMMENTS_MAX,
  SHEET_THREADS_MAX,
  threadIdOf,
  type SheetThread,
  type SheetThreadOp,
  type SheetThreadWriter,
} from './sheet-threads';

const axes = { rows: ['ra', 'rb', 'rc'], cols: ['ca', 'cb', 'cc'] };
const ada: SheetThreadWriter = {
  key: 'aaa',
  name: 'Ada',
  colour: '#111111',
  edits: false,
  now: 10,
};
const bo: SheetThreadWriter = { key: 'bbb', name: 'Bo', colour: '#222222', edits: false, now: 20 };
const ed: SheetThreadWriter = { ...bo, key: 'eee', edits: true };
const cell = { r1: 'rb', c1: 'cb', r2: 'rb', c2: 'cb' };

const op = (raw: Record<string, unknown>): SheetThreadOp => {
  const read = readThreadOp(raw);
  if (!read) throw new Error(`unread ${JSON.stringify(raw)}`);
  return read;
};

function run(thread: SheetThread | null, o: SheetThreadOp, who = ada, count = 0) {
  return applyThreadOp({ sheetId: 's1', thread, count, axes }, o, who);
}

function started(): SheetThread {
  const made = run(null, op({ op: 'start', id: 't1', comment: 'c1', anchor: cell, text: 'Why?' }));
  if (!made.ok || !made.thread) throw new Error('not started');
  return made.thread;
}

const after = (r: ReturnType<typeof run>) => {
  if (!r.ok) throw new Error(r.refusal);
  return r.thread;
};

describe('readThreadOp', () => {
  it('reads each op, its mentions drawn and an assignee kept', () => {
    const priya = { userId: 'u1', name: 'Priya', handle: 'priya' };
    expect(
      readThreadOp({
        op: 'reply',
        thread: 't1',
        id: 'c2',
        text: '+priya over to you',
        mentions: [priya, { name: 'no handle' }],
        assignee: priya,
      }),
    ).toEqual({
      op: 'reply',
      thread: 't1',
      id: 'c2',
      text: '+priya over to you',
      mentions: [priya],
      assignee: priya,
    });
    expect(readThreadOp({ op: 'resolve', thread: 't1', resolved: true })).toEqual({
      op: 'resolve',
      thread: 't1',
      resolved: true,
    });
    expect(readThreadOp({ op: 'remove', thread: 't1', comment: 'c1' })).toMatchObject({
      op: 'remove',
    });
    expect(
      readThreadOp({ op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: true }),
    ).toMatchObject({ op: 'react', emoji: '👍' });
    expect(readThreadOp({ op: 'edit', thread: 't1', comment: 'c1', text: 'x' })).toMatchObject({
      op: 'edit',
    });
  });

  it('refuses a malformed op', () => {
    for (const raw of [
      null,
      [],
      { op: 'nope' },
      { op: 'start', id: 't1', comment: 'c1', anchor: cell, text: '   ' },
      { op: 'start', id: 't1', comment: 'c1', anchor: { r1: 'ra' }, text: 'x' },
      { op: 'start', id: 't1', comment: 'c1', anchor: 'B2', text: 'x' },
      { op: 'start', id: 'bad id', comment: 'c1', anchor: cell, text: 'x' },
      { op: 'reply', thread: 't1', id: 'c2', text: 'x'.repeat(SHEET_COMMENT_TEXT_MAX + 1) },
      { op: 'reply', thread: 't1', id: 'c2', text: 'bell\u0007' },
      { op: 'reply', thread: 't1', id: 'c2', text: 'x', mentions: 'priya' },
      { op: 'reply', thread: 't1', id: 'c2', text: 'x', assignee: { name: 'no handle' } },
      { op: 'edit', thread: 't1', text: 'x' },
      { op: 'remove', thread: 't1' },
      { op: 'resolve', thread: 't1', resolved: 'yes' },
      { op: 'react', thread: 't1', comment: 'c1', emoji: '', on: true },
      { op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: 1 },
    ])
      expect(readThreadOp(raw)).toBeNull();
  });

  it('names the thread an op is on', () => {
    expect(threadIdOf(op({ op: 'start', id: 't9', comment: 'c', anchor: cell, text: 'x' }))).toBe(
      't9',
    );
    expect(threadIdOf(op({ op: 'resolve', thread: 't3', resolved: false }))).toBe('t3');
  });
});

describe('applyThreadOp', () => {
  it('starts a thread on a range, ordered, by its author with their key', () => {
    const made = run(
      null,
      op({
        op: 'start',
        id: 't1',
        comment: 'c1',
        anchor: { r1: 'rc', c1: 'cc', r2: 'ra', c2: 'ca' },
        text: 'Check',
      }),
    );
    expect(made).toEqual({
      ok: true,
      id: 't1',
      thread: {
        id: 't1',
        sheetId: 's1',
        anchor: { r1: 'ra', c1: 'ca', r2: 'rc', c2: 'cc' },
        resolved: false,
        comments: [
          {
            id: 'c1',
            text: 'Check',
            at: 10,
            author: { key: 'aaa', name: 'Ada', colour: '#111111' },
          },
        ],
        v: 1,
      },
    });
  });

  it('refuses a start off the sheet, on a thread that exists, or past the sheet’s threads', () => {
    const off = op({
      op: 'start',
      id: 't1',
      comment: 'c',
      anchor: { ...cell, r2: 'zz' },
      text: 'x',
    });
    expect(run(null, off)).toEqual({ ok: false, refusal: 'thread_invalid' });
    const again = op({ op: 'start', id: 't1', comment: 'c', anchor: cell, text: 'x' });
    expect(run(started(), again)).toEqual({ ok: false, refusal: 'thread_invalid' });
    expect(run(null, again, ada, SHEET_THREADS_MAX)).toEqual({
      ok: false,
      refusal: 'threads_full',
    });
  });

  it('replies, resolves and reopens, counting each change', () => {
    const t = started();
    const priya = { userId: 'u1', name: 'Priya', handle: 'priya' };
    const replied = after(
      run(t, op({ op: 'reply', thread: 't1', id: 'c2', text: 'Fine', assignee: priya }), bo),
    );
    expect(replied?.comments[1]?.assignee).toEqual(priya);
    expect(replied?.comments.map((c) => [c.id, c.author.key, c.at])).toEqual([
      ['c1', 'aaa', 10],
      ['c2', 'bbb', 20],
    ]);
    expect(replied?.v).toBe(2);
    const resolved = after(run(replied, op({ op: 'resolve', thread: 't1', resolved: true }), bo));
    expect([resolved?.resolved, resolved?.v]).toEqual([true, 3]);
    const reopened = after(run(resolved, op({ op: 'resolve', thread: 't1', resolved: false })));
    expect(reopened?.resolved).toBe(false);
  });

  it('refuses an op on a thread or comment that is gone, a reply id taken, a full thread', () => {
    const t = started();
    expect(run(null, op({ op: 'resolve', thread: 't1', resolved: true }))).toEqual({
      ok: false,
      refusal: 'thread_gone',
    });
    expect(run(t, op({ op: 'edit', thread: 't1', comment: 'zz', text: 'x' }))).toEqual({
      ok: false,
      refusal: 'thread_gone',
    });
    expect(run(t, op({ op: 'reply', thread: 't1', id: 'c1', text: 'x' }))).toEqual({
      ok: false,
      refusal: 'thread_invalid',
    });
    const full: SheetThread = {
      ...t,
      comments: Array.from({ length: SHEET_THREAD_COMMENTS_MAX }, (_, i) => ({
        ...t.comments[0]!,
        id: `c${i}`,
      })),
    };
    expect(run(full, op({ op: 'reply', thread: 't1', id: 'new', text: 'x' }))).toEqual({
      ok: false,
      refusal: 'thread_full',
    });
  });

  it("edits one's own comment alone, marking the edit and replacing its mentions", () => {
    const t = after(
      run(
        started(),
        op({
          op: 'reply',
          thread: 't1',
          id: 'c2',
          text: '+priya',
          mentions: [{ userId: 'u1', name: 'Priya', handle: 'priya' }],
        }),
        bo,
      ),
    )!;
    expect(run(t, op({ op: 'edit', thread: 't1', comment: 'c2', text: 'x' }), ada)).toEqual({
      ok: false,
      refusal: 'forbidden',
    });
    expect(run(t, op({ op: 'edit', thread: 't1', comment: 'c2', text: 'x' }), ed)).toEqual({
      ok: false,
      refusal: 'forbidden',
    });
    const edited = after(
      run(t, op({ op: 'edit', thread: 't1', comment: 'c2', text: 'Plain' }), bo),
    );
    expect(edited?.comments[1]).toEqual({
      id: 'c2',
      text: 'Plain',
      at: 20,
      edited: 20,
      author: { key: 'bbb', name: 'Bo', colour: '#222222' },
    });
    const assigned = after(
      run(
        t,
        op({
          op: 'edit',
          thread: 't1',
          comment: 'c2',
          text: '+priya yours',
          mentions: [{ userId: 'u1', name: 'Priya', handle: 'priya' }],
          assignee: { userId: 'u1', name: 'Priya', handle: 'priya' },
        }),
        bo,
      ),
    );
    expect(assigned?.comments[1]).toMatchObject({ assignee: { userId: 'u1' } });
  });

  it("removes one's own comment, an Editor anyone's, and the first comment takes the thread", () => {
    const t = after(run(started(), op({ op: 'reply', thread: 't1', id: 'c2', text: 'Mine' }), bo))!;
    expect(run(t, op({ op: 'remove', thread: 't1', comment: 'c2' }), ada)).toEqual({
      ok: false,
      refusal: 'forbidden',
    });
    expect(
      after(run(t, op({ op: 'remove', thread: 't1', comment: 'c2' }), bo))?.comments,
    ).toHaveLength(1);
    expect(run(t, op({ op: 'remove', thread: 't1', comment: 'c1' }), ed)).toEqual({
      ok: true,
      id: 't1',
      thread: null,
    });
  });

  it('adds and takes back reactions by key, sorted, and keeps to the emoji cap', () => {
    const t = started();
    const one = after(
      run(t, op({ op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: true }), bo),
    )!;
    const two = after(
      run(one, op({ op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: true })),
    )!;
    expect(two.comments[0]?.reactions).toEqual({ '👍': ['aaa', 'bbb'] });
    const same = after(
      run(two, op({ op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: true })),
    )!;
    expect(same.comments[0]?.reactions).toEqual({ '👍': ['aaa', 'bbb'] });
    const back = after(
      run(one, op({ op: 'react', thread: 't1', comment: 'c1', emoji: '👍', on: false }), bo),
    )!;
    expect(back.comments[0]?.reactions).toBeUndefined();
    const many: SheetThread = {
      ...t,
      comments: [
        {
          ...t.comments[0]!,
          reactions: Object.fromEntries(
            Array.from({ length: SHEET_REACTIONS_MAX }, (_, i) => [`e${i}`, ['bbb']]),
          ),
        },
      ],
    };
    expect(
      run(many, op({ op: 'react', thread: 't1', comment: 'c1', emoji: '🎉', on: true })),
    ).toEqual({ ok: false, refusal: 'thread_invalid' });
  });
});
