// @vitest-environment jsdom
// A spreadsheet's comment threads in the grid (docs/specs/029-sheets/review.md "In the grid", D644, D655, D656):
// Insert › Comment (and Ctrl+Alt+M) opens a new thread's card on the selection, or the active cell's open thread with
// the keys in its reply; the card of the active cell's thread shows beside its anchor, Escape lets it go; replies,
// edits, resolving and reactions go to the threads route, counted; a refusal is toasted; J and K step through the
// sheet's threads in reading order; a Viewer reads none and a spreadsheet in This Browser dims the item.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThreadOp,
  SHEET_THREADS_MAX,
  type SheetThread,
  type SheetThreadOp,
} from '@livedoc/document';
import { cellKey } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  SHEET_ID,
  stubResizeObserver,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetThreadMarks } from '@/components/sheets/sheet-thread-marks-context';
import { ApiError } from '@/lib/api/core';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  ENTER_COMMENT,
  INSERT_COMMENT,
  NEXT_COMMENT,
  PREVIOUS_COMMENT,
  SYNC_TO_COMMENT,
} from '@/lib/spreadsheet/sheet-comments';
import { SpreadsheetReviewContext, type SpreadsheetReview } from './spreadsheet-review-context';
import { SHEET_COMMENTS_FULL, useSpreadsheetComments } from './useSpreadsheetComments';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

// The threads route, played by the model the api applies: every op judged as the api judges it.
const server = vi.hoisted(() => ({
  threads: new Map<string, unknown>(),
  axes: { rows: [] as string[], cols: [] as string[] },
  refuse: null as string | null,
  reads: 0,
  writer: { key: 'k-ada', name: 'Ada', colour: '#0284c7', edits: true },
}));
vi.mock('@/lib/api/sheet-threads', () => ({
  fetchSheetThreads: vi.fn(async () => {
    server.reads++;
    return [...server.threads.values()];
  }),
  postSheetThread: vi.fn(async (_scope: unknown, sheetId: string, op: SheetThreadOp) => {
    if (server.refuse) throw new ApiError('sheet thread', 413, server.refuse);
    const name = op.op === 'start' ? op.id : op.thread;
    const res = applyThreadOp(
      {
        sheetId,
        thread: (server.threads.get(name) as SheetThread | undefined) ?? null,
        count: server.threads.size,
        axes: server.axes,
      },
      op,
      { ...server.writer, now: 5 },
    );
    if (!res.ok) throw new ApiError('sheet thread', 400, res.refusal);
    if (res.thread) server.threads.set(res.id, res.thread);
    else server.threads.delete(res.id);
    return { id: res.id, thread: res.thread };
  }),
}));

beforeAll(stubResizeObserver);
beforeEach(() => {
  vi.mocked(track).mockClear();
  server.threads.clear();
  server.refuse = null;
  server.reads = 0;
  server.writer = { key: 'k-ada', name: 'Ada', colour: '#0284c7', edits: true };
});
afterEach(cleanup);

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7', mayDeleteAny: true };
const REVIEW: SpreadsheetReview = { commenter: ADA, local: false, selfUserId: null };
const scope = { ownerId: 'o1', documentId: 'd1', shareCode: null, tabId: null };

type Seen = ReturnType<typeof useSpreadsheetComments>;

const openSheetAt = vi.fn();

function Probe({
  p,
  onRender,
}: {
  p: Parameters<Parameters<typeof renderSheet>[1]>[0];
  onRender: (seen: Seen) => void;
}) {
  const comments = useSpreadsheetComments(p.c, { scope, goTo: p.actions.goTo, openSheetAt });
  onRender(comments);
  return comments.card;
}

async function setup(
  opts: { review?: SpreadsheetReview; threads?: (key: Key) => SheetThread[] } = {},
) {
  const h: SheetHarness = await makeSheet({ rows: 8, cols: 5 });
  const layout = h.store.sheet(SHEET_ID)!.layout;
  server.axes = { rows: [...layout.rows], cols: [...layout.cols] };
  const key: Key = (a1) => {
    const [, col, row] = /^([A-Z])(\d+)$/.exec(a1)!;
    return { r: layout.rows[Number(row) - 1]!, c: layout.cols[col!.charCodeAt(0) - 65]! };
  };
  for (const t of opts.threads?.(key) ?? []) server.threads.set(t.id, t);
  const out: {
    actions: OfficeActions;
    marks: SheetThreadMarks | null;
    step?: (f: boolean) => void;
    seen?: Seen;
  } = {
    actions: {},
    marks: null,
  };
  renderSheet(h, (p) => (
    <SpreadsheetReviewContext.Provider value={opts.review ?? REVIEW}>
      <Probe
        p={p}
        onRender={(seen) => {
          out.actions = seen.actions;
          out.marks = seen.marks;
          out.step = (forward) => seen.step(forward, null);
          out.seen = seen;
        }}
      />
    </SpreadsheetReviewContext.Provider>
  ));
  await act(async () => {});
  return {
    h,
    out,
    key,
    marked: (a1: string) => out.marks?.byCell.has(cellKeyOf(key(a1))) ?? false,
  };
}

type Key = (a1: string) => { r: string; c: string };
const cellKeyOf = (k: { r: string; c: string }) => cellKey(k.r, k.c);

const thread = (
  key: Key,
  id: string,
  a1: string,
  text: string,
  extra: Partial<SheetThread> = {},
): SheetThread => {
  const at = key(a1);
  return {
    id,
    sheetId: SHEET_ID,
    anchor: { r1: at.r, c1: at.c, r2: at.r, c2: at.c },
    resolved: false,
    comments: [
      { id: `${id}-1`, text, at: 1, author: { key: 'k-bo', name: 'Bo', colour: '#16a34a' } },
    ],
    v: 1,
    ...extra,
  };
};

const field = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Add a comment' });
const say = async (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
  });
};
const card = () => document.querySelector('[data-sheet-thread-card]');

describe('Insert › Comment', () => {
  it('opens a new thread’s card on the selection, and Comment starts it there, marked and counted', async () => {
    const { h, out, key, marked } = await setup();
    act(() => h.select('B2:C3'));
    act(() => out.actions[INSERT_COMMENT]!.run());
    expect(screen.getByRole('group', { name: 'New comment' })).toBeTruthy();
    await say('Check these');
    const [started] = server.threads.values() as Iterable<SheetThread>;
    expect(started!.anchor).toEqual({
      r1: key('B2').r,
      c1: key('B2').c,
      r2: key('C3').r,
      c2: key('C3').c,
    });
    expect(started!.comments[0]).toMatchObject({ text: 'Check these', author: { key: 'k-ada' } });
    expect(marked('B2')).toBe(true);
    expect(track).toHaveBeenCalledWith('Comment', 'Added', 'Spreadsheet');
    // The new thread's card, beside its anchor, now the active cell's.
    const startedCard = screen.getByRole('group', { name: 'Comment by Ada on B2:C3' });
    await vi.waitFor(() => expect(document.activeElement).toBe(startedCard));
    expect(h.writes).toEqual([]);
  });

  it('drops the draft when the active cell moves, and Cancel drops it too', async () => {
    const { h, out } = await setup();
    act(() => h.select('B2:C3'));
    act(() => out.actions[INSERT_COMMENT]!.run());
    expect(card()).not.toBeNull();
    act(() => h.select('D5'));
    expect(card()).toBeNull();
    act(() => h.select('B2:C3'));
    expect(card()).toBeNull();
    act(() => out.actions[INSERT_COMMENT]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(card()).toBeNull();
    expect(server.threads.size).toBe(0);
  });

  it('on a cell with an open thread, puts the keys in its reply; Reply adds to it, counted', async () => {
    const { h, out } = await setup({
      threads: (key) => [thread(key, 'th1', 'A2', 'Is this right?')],
    });
    act(() => h.select('A2'));
    expect(screen.getByRole('group', { name: 'Comment by Bo on A2' })).toBeTruthy();
    expect(document.activeElement).not.toBe(field());
    vi.useFakeTimers();
    act(() => out.actions[INSERT_COMMENT]!.run());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();
    expect(document.activeElement).toBe(field());
    await say('Yes');
    expect((server.threads.get('th1') as SheetThread).comments.map((c) => c.text)).toEqual([
      'Is this right?',
      'Yes',
    ]);
    expect(track).toHaveBeenCalledWith('Comment', 'Added', 'Spreadsheet');
  });

  it('refuses past the most threads a sheet holds, and toasts a refused write', async () => {
    const { h, out } = await setup({
      threads: (key) =>
        Array.from({ length: SHEET_THREADS_MAX }, (_, i) =>
          thread(key, `t${i}`, 'E8', 'x', { resolved: true }),
        ),
    });
    act(() => h.select('A1'));
    act(() => out.actions[INSERT_COMMENT]!.run());
    expect(h.toast).toHaveBeenCalledWith(SHEET_COMMENTS_FULL);
    expect(card()).toBeNull();
    cleanup();
    server.threads.clear();
    const second = await setup();
    act(() => second.h.select('A1'));
    act(() => second.out.actions[INSERT_COMMENT]!.run());
    server.refuse = 'thread_full';
    await say('One more');
    expect(second.h.toast).toHaveBeenCalledWith(
      'This comment thread holds the most replies it can',
    );
  });
});

describe('a thread’s card', () => {
  it('lets go on Escape until the active cell moves away and back', async () => {
    const { h } = await setup({ threads: (key) => [thread(key, 'th1', 'A2', 'Look')] });
    act(() => h.select('A2'));
    fireEvent.keyDown(card()!.querySelector('[data-thread-card]')!, { key: 'Escape' });
    expect(card()).toBeNull();
    act(() => h.select('A3'));
    act(() => h.select('A2'));
    expect(card()).not.toBeNull();
  });

  it('resolves a thread, its marker gone, and counts it; reacts, counted', async () => {
    const { h, marked } = await setup({ threads: (key) => [thread(key, 'th1', 'C4', 'Fix')] });
    act(() => h.select('C4'));
    expect(marked('C4')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji reaction' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'React with ❤️' }));
    });
    expect((server.threads.get('th1') as SheetThread).comments[0]!.reactions).toEqual({
      '❤️': ['k-ada'],
    });
    expect(track).toHaveBeenCalledWith('Comment', 'Added', 'SpreadsheetReaction');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    });
    expect((server.threads.get('th1') as SheetThread).resolved).toBe(true);
    expect(marked('C4')).toBe(false);
    expect(track).toHaveBeenCalledWith('Comment', 'Resolved', 'Spreadsheet');
    expect(card()).toBeNull();
  });

  it('edits one’s own comment keeping its assignee, and deletes a reply', async () => {
    const priya = { userId: 'u-p', name: 'Priya', handle: 'priya' };
    const { h } = await setup({
      threads: (key) => [
        {
          ...thread(key, 'th1', 'B1', 'Do it @priya'),
          comments: [
            {
              id: 'c1',
              text: 'Do it @priya',
              at: 1,
              author: { key: 'k-ada', name: 'Ada', colour: '#000000' },
              mentions: [priya],
              assignee: priya,
            },
            {
              id: 'c2',
              text: 'Later',
              at: 2,
              author: { key: 'k-bo', name: 'Bo', colour: '#000000' },
            },
          ],
        },
      ],
    });
    act(() => h.select('B1'));
    expect(screen.getByText('Assigned to Priya')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit comment' })[0]!);
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Edit comment' });
    fireEvent.change(editor, { target: { value: 'Do it today @priya' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    const kept = (server.threads.get('th1') as SheetThread).comments[0]!;
    expect(kept).toMatchObject({ text: 'Do it today @priya', mentions: [priya], assignee: priya });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' }).at(-1)!);
    });
    expect((server.threads.get('th1') as SheetThread).comments).toHaveLength(1);
  });

  it('moves to the next thread on J, the keys in its card, and toasts a refused reply', async () => {
    const { h } = await setup({
      threads: (key) => [thread(key, 'a', 'A1', 'first'), thread(key, 'b', 'C3', 'second')],
    });
    act(() => h.select('A1'));
    vi.useFakeTimers();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Comment by Bo on A1' }), { key: 'j' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();
    expect(h.ctl().selection.active).toEqual({ r: 2, c: 2 });
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Comment by Bo on C3' }));
    server.refuse = 'thread_gone';
    await say('Too late');
    expect(h.toast).toHaveBeenCalledWith('That comment is no longer there');
    expect(track).not.toHaveBeenCalled();
  });

  it('steps through the sheet’s threads in reading order, wrapping', async () => {
    const { h, out } = await setup({
      threads: (key) => [thread(key, 'b', 'B5', 'second'), thread(key, 'a', 'D1', 'first')],
    });
    act(() => h.select('A1'));
    act(() => out.step!(true));
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 3 });
    act(() => out.step!(true));
    expect(h.ctl().selection.active).toEqual({ r: 4, c: 1 });
    act(() => out.step!(true));
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 3 });
    act(() => out.step!(false));
    expect(h.ctl().selection.active).toEqual({ r: 4, c: 1 });
  });
});

describe('going to a thread', () => {
  it('selects its anchor with the card taking the keys, or opens its own sheet', async () => {
    openSheetAt.mockClear();
    const { h, out } = await setup({
      threads: (key) => [
        thread(key, 'here', 'C4', 'On this sheet'),
        { ...thread(key, 'there', 'A1', 'Elsewhere'), sheetId: 'other' },
      ],
    });
    vi.useFakeTimers();
    act(() => out.seen!.go('here'));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();
    expect(h.ctl().selection.active).toEqual({ r: 3, c: 2 });
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Comment by Bo on C4' }));
    act(() => out.seen!.go('there'));
    act(() => out.seen!.go('missing'));
    // The other sheet is not in this workbook's harness: nothing opens.
    expect(openSheetAt).not.toHaveBeenCalled();
  });

  it('opens the sheet alone for a thread whose cell was deleted (D653)', async () => {
    const { h, out } = await setup({
      threads: () => [
        {
          ...thread(() => ({ r: 'gone', c: 'gone' }), 'lost', 'A1', 'Lost'),
        },
      ],
    });
    act(() => h.select('D6'));
    act(() => out.seen!.go('lost'));
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 0 });
    expect(card()).toBeNull();
  });

  it('reopens a resolved thread, its marker back', async () => {
    const { out, marked } = await setup({
      threads: (key) => [thread(key, 'th1', 'B2', 'Done', { resolved: true })],
    });
    expect(marked('B2')).toBe(false);
    expect(out.seen!.threads.has('th1')).toBe(true);
    await act(async () => out.seen!.reopen('th1'));
    expect(marked('B2')).toBe(true);
    await act(async () => out.seen!.reopen('missing'));
  });

  it('goes to an Inbox row’s thread once the threads are read, once an ask', async () => {
    const { h } = await setup({
      review: { ...REVIEW, arrival: { threadId: 'th1', n: 1 } },
      threads: (key) => [thread(key, 'th1', 'D7', 'From the Inbox')],
    });
    expect(h.ctl().selection.active).toEqual({ r: 6, c: 3 });
    act(() => h.select('A1'));
    expect(h.ctl().selection.active).toEqual({ r: 0, c: 0 });
  });

  it('moves to the next and previous thread, and enters the active cell’s, from their keys', async () => {
    const { h, out } = await setup({
      threads: (key) => [thread(key, 'a', 'B2', 'one'), thread(key, 'b', 'D3', 'two')],
    });
    act(() => h.select('A1'));
    expect(out.actions[ENTER_COMMENT]).toBeUndefined();
    act(() => out.actions[NEXT_COMMENT]!.run());
    expect(h.ctl().selection.active).toEqual({ r: 1, c: 1 });
    act(() => out.actions[PREVIOUS_COMMENT]!.run());
    expect(h.ctl().selection.active).toEqual({ r: 2, c: 3 });
    fireEvent.keyDown(card()!.querySelector('[data-thread-card]')!, { key: 'u' });
    expect(card()).toBeNull();
    vi.useFakeTimers();
    act(() => out.actions[ENTER_COMMENT]!.run());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Comment by Bo on D3' }));
  });

  it('keeps the panel’s filters', async () => {
    const { out } = await setup();
    act(() => out.seen!.setFilters({ who: 'for-you', state: 'open', group: null }));
    expect(out.seen!.filters).toEqual({ who: 'for-you', state: 'open', group: null });
  });
});

describe('who comments', () => {
  it('reads nothing and binds nothing for a Viewer (D655)', async () => {
    const { out } = await setup({ review: { commenter: null, local: false, selfUserId: null } });
    expect(out.actions).toEqual({});
    expect(out.marks).toBeNull();
    expect(server.reads).toBe(0);
  });

  it('dims Insert › Comment with a hint to sync in This Browser (D656)', async () => {
    const { out } = await setup({ review: { commenter: null, local: true, selfUserId: null } });
    expect(out.actions[INSERT_COMMENT]).toMatchObject({ disabled: true, hint: SYNC_TO_COMMENT });
    out.actions[INSERT_COMMENT]!.run();
    expect(server.reads).toBe(0);
  });
});
