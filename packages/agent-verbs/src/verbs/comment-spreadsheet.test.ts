import { describe, expect, it } from 'vitest';
import { applyThreadOp, type SheetThread, type SheetThreadOp } from '@livedoc/document';
import { WorkbookRecord } from '@livedoc/sheets';
import { VerbRefusal } from '../define';
import { contextOf, DOC_A, fakeApi, library } from '../testing/fake-api';
import { commentAdd, commentLs, commentReopen, commentReply, commentResolve } from './comment';

// The comment verbs on a spreadsheet (docs/specs/029-sheets/review.md "Agents"): the ref names a sheet, --cell or
// --range its cells; a thread found by its top-left cell, written through the sheet's threads route; listed by its
// sheet and range.

const ROWS = ['row001', 'row002', 'row003', 'row004', 'row005'];
const COLS = ['cola01', 'colb01', 'colc01'];
const sheetJson = {
  id: 'sheet01',
  tabId: 'tab-budget',
  title: 'Budget',
  layout: { rows: ROWS, cols: COLS },
  cells: [],
  rev: 1,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: { id: 'x', name: 'X', color: '#000' },
};

function setUp(
  opts: { threads?: SheetThread[]; refuse?: string; broken?: true; offline?: true } = {},
) {
  const threads = new Map((opts.threads ?? []).map((t) => [t.id, t]));
  const sent: SheetThreadOp[] = [];
  const api = fakeApi({
    ...library,
    [`/documents/${DOC_A}`]: {
      document: {
        id: DOC_A,
        name: 'Auth flow',
        tabs: [{ id: 'tab-budget', name: 'Budget', orderIndex: 0, kind: 'sheet' }],
      },
    },
    [`/documents/${DOC_A}/sheets`]: {
      sheets: [sheetJson],
      workbook: WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
    },
    [`/documents/${DOC_A}/sheet-threads`]: () => Response.json({ threads: [...threads.values()] }),
    [`/documents/${DOC_A}/sheets/sheet01/threads`]: async (r: Request) => {
      const { op } = (await r.json()) as { op: SheetThreadOp };
      sent.push(op);
      if (opts.offline) throw new TypeError('offline');
      if (opts.broken) return new Response('boom', { status: 500 });
      if (opts.refuse) return Response.json({ error: opts.refuse }, { status: 413 });
      const id = op.op === 'start' ? op.id : op.thread;
      const res = applyThreadOp(
        {
          sheetId: 'sheet01',
          thread: threads.get(id) ?? null,
          count: threads.size,
          axes: { rows: ROWS, cols: COLS },
        },
        op,
        { key: 'k-me', name: 'Me', colour: '#000000', edits: true, now: 9 },
      );
      if (!res.ok) return Response.json({ error: res.refusal }, { status: 400 });
      if (res.thread) threads.set(id, res.thread);
      return Response.json({ id, thread: res.thread });
    },
  });
  return { ctx: contextOf(api), threads, sent };
}

const thread = (id: string, r: string, c: string, resolved = false, at = 1): SheetThread => ({
  id,
  sheetId: 'sheet01',
  anchor: { r1: r, c1: c, r2: r, c2: c },
  resolved,
  comments: [
    { id: `${id}c`, text: `On ${id}`, at, author: { key: 'k', name: 'Ada', colour: '#111111' } },
  ],
  v: 1,
});

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof VerbRefusal ? [e.status, e.code] : e),
  );

describe('comment verbs on a spreadsheet', () => {
  it('starts a thread on a range by the sheet’s ids, then adds to it by its top-left cell', async () => {
    const { ctx, threads, sent } = setUp();
    const out = await commentAdd.run!(ctx, {
      doc: DOC_A,
      ref: 'Budget',
      text: 'Final?',
      range: 'B2:C4',
    });
    expect(out.text).toMatch(/^\+ comment .+ on Budget!B2:C4$/);
    expect(sent[0]).toMatchObject({
      op: 'start',
      anchor: { r1: 'row002', c1: 'colb01', r2: 'row004', c2: 'colc01' },
      text: 'Final?',
    });
    const more = await commentAdd.run!(ctx, {
      doc: DOC_A,
      ref: 'budget',
      text: 'And?',
      cell: 'B2',
    });
    expect(more.text).toMatch(/ on Budget!B2$/);
    expect(sent[1]).toMatchObject({ op: 'reply', text: 'And?' });
    expect([...threads.values()][0]!.comments.map((c) => c.text)).toEqual(['Final?', 'And?']);
  });

  it('reopens a resolved thread it adds to, preferring an open one there', async () => {
    const { ctx, sent } = setUp({ threads: [thread('old', 'row001', 'cola01', true)] });
    await commentAdd.run!(ctx, { doc: DOC_A, ref: 'Budget', text: 'Again', cell: 'A1' });
    expect(sent.map((o) => o.op)).toEqual(['resolve', 'reply']);
    expect(sent[0]).toMatchObject({ thread: 'old', resolved: false });
    const two = setUp({
      threads: [
        thread('done', 'row001', 'cola01', true, 5),
        thread('open', 'row001', 'cola01', false, 3),
        thread('later', 'row001', 'cola01', false, 4),
      ],
    });
    await commentReply.run!(two.ctx, { doc: DOC_A, ref: 'Budget', text: 'Yes', cell: 'A1' });
    expect(two.sent[0]).toMatchObject({ op: 'reply', thread: 'open' });
  });

  it('picks the latest resolved thread there when none is open', async () => {
    const { ctx, sent } = setUp({
      threads: [
        thread('first', 'row001', 'cola01', true, 1),
        thread('latest', 'row001', 'cola01', true, 7),
        { ...thread('bare', 'row001', 'cola01', true), comments: [] },
      ],
    });
    await commentReopen.run!(ctx, { doc: DOC_A, ref: 'Budget', cell: 'A1' });
    expect(sent[0]).toMatchObject({ op: 'resolve', thread: 'latest', resolved: false });
  });

  it('resolves and reopens the thread on a cell', async () => {
    const { ctx, sent } = setUp({ threads: [thread('t', 'row003', 'colb01')] });
    const done = await commentResolve.run!(ctx, { doc: DOC_A, ref: 'Budget', cell: 'B3' });
    expect(done.text).toBe('~ thread Budget!B3 resolved');
    const back = await commentReopen.run!(ctx, { doc: DOC_A, ref: 'Budget', cell: 'B3' });
    expect(back.text).toBe('~ thread Budget!B3 open');
    expect(sent.map((o) => [o.op, (o as { resolved?: boolean }).resolved])).toEqual([
      ['resolve', true],
      ['resolve', false],
    ]);
  });

  it('refuses no cells, a cell off the sheet, an unknown sheet, no thread there, and the api’s refusal in words', async () => {
    const { ctx } = setUp();
    expect(await refusal(commentAdd.run!(ctx, { doc: DOC_A, ref: 'Budget', text: 'x' }))).toEqual([
      400,
      'cell_needed',
    ]);
    expect(
      await refusal(commentAdd.run!(ctx, { doc: DOC_A, ref: 'Budget', text: 'x', cell: 'Z99' })),
    ).toEqual([400, 'cell_not_found']);
    expect(
      await refusal(commentAdd.run!(ctx, { doc: DOC_A, ref: 'Budget', text: 'x', range: 'nope' })),
    ).toEqual([400, 'cell_not_found']);
    expect(
      await refusal(commentAdd.run!(ctx, { doc: DOC_A, ref: 'Costs', text: 'x', cell: 'A1' })),
    ).toEqual([404, 'sheet_not_found']);
    expect(
      await refusal(commentReply.run!(ctx, { doc: DOC_A, ref: 'Budget', text: 'x', cell: 'A1' })),
    ).toEqual([404, 'no_thread']);
    expect(
      await refusal(commentResolve.run!(ctx, { doc: DOC_A, ref: 'Budget', cell: 'A1' })),
    ).toEqual([404, 'no_thread']);
    const full = setUp({ refuse: 'thread_full' });
    expect(
      await refusal(
        commentAdd.run!(full.ctx, { doc: DOC_A, ref: 'Budget', text: 'x', cell: 'A1' }),
      ),
    ).toEqual([413, 'thread_full']);
    await expect(
      commentReply.run!(
        setUp({ refuse: 'thread_full', threads: [thread('t', 'row001', 'cola01')] }).ctx,
        {
          doc: DOC_A,
          ref: 'Budget',
          text: 'x',
          cell: 'A1',
        },
      ),
    ).rejects.toMatchObject({ message: 'a comment thread holds up to 500 comments.' });
    const broken = setUp({ broken: true });
    await expect(
      commentAdd.run!(broken.ctx, { doc: DOC_A, ref: 'Budget', text: 'x', cell: 'A1' }),
    ).rejects.toThrow('500');
    await expect(
      commentAdd.run!(setUp({ offline: true }).ctx, {
        doc: DOC_A,
        ref: 'Budget',
        text: 'x',
        cell: 'A1',
      }),
    ).rejects.toThrow('offline');
    const odd = setUp({ refuse: 'mystery' });
    await expect(
      commentAdd.run!(odd.ctx, { doc: DOC_A, ref: 'Budget', text: 'x', cell: 'A1' }),
    ).rejects.toThrow('413');
  });

  it('lists the spreadsheet’s threads by sheet and range, a deleted cell’s by its sheet alone', async () => {
    const { ctx } = setUp({
      threads: [
        thread('a', 'row002', 'colb01'),
        thread('b', 'gone', 'cola01'),
        thread('c', 'row001', 'cola01', true),
        { ...thread('d', 'row001', 'cola01'), sheetId: 'other' },
      ],
    });
    const open = await commentLs.run!(ctx, { doc: DOC_A, status: 'open' });
    expect(open.threads.map((t) => [t.elementId, t.ref, t.label, t.cell, t.tabName])).toEqual([
      ['a', 'Budget', 'Budget!B2', 'B2', 'Budget'],
      ['b', 'Budget', 'Budget (deleted cell)', undefined, 'Budget'],
    ]);
    expect(open.threads[0]!.comments).toEqual([
      { id: 'ac', authorName: 'Ada', createdAt: 1, text: 'On a' },
    ]);
    const resolved = await commentLs.run!(ctx, { doc: DOC_A, status: 'resolved' });
    expect(resolved.threads.map((t) => t.elementId)).toEqual(['c']);
    const all = await commentLs.run!(ctx, { doc: DOC_A, status: 'all', tab: 'Budget' });
    expect(all.threads).toHaveLength(3);
  });
});
