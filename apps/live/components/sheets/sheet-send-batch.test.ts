// docs/specs/029-sheets/sheet-store.md "Changing a sheet" (write batching): a sheet's writes made in one moment go as
// fewer, each pending at once as made, the merged writes taking their place on the pending list.
import { describe, expect, it, vi } from 'vitest';
import type { CellChange, SheetWrite } from '@livedoc/sheets';
import { SendBatch, type PendingWrite, type SendBatchHost } from './sheet-send-batch';

const cells = (...changes: CellChange[]): SheetWrite => ({ kind: 'cells', cells: changes });
const one = (r: string, n: number) => cells({ r, c: 'c1', i: { n } });

function harness(pending: Map<string, PendingWrite[]>) {
  let n = 0;
  const moments: (() => void)[] = [];
  const sent: { sheetId: string; wid: string; write: SheetWrite; flags: object }[] = [];
  const host: SendBatchHost = {
    pending: (sheetId) => pending.get(sheetId),
    send: vi.fn((sheetId, wid, write, flags) => void sent.push({ sheetId, wid, write, flags })),
    newWid: () => `w${n++}`,
    later: (go) => void moments.push(go),
  };
  return { batch: new SendBatch(host), sent, moments, host };
}

describe('SendBatch', () => {
  it('holds each write pending at once and sends them merged at the next moment', () => {
    const pending = new Map([['s1', [{ wid: 'old', write: one('r0', 0) }]]]);
    const { batch, sent, moments } = harness(pending);
    batch.add('s1', one('r1', 1), {});
    batch.add('s1', one('r2', 2), {});
    expect(pending.get('s1')!.map((p) => p.wid)).toEqual(['old', 'w0', 'w1']);
    expect(sent).toEqual([]);
    expect(moments).toHaveLength(1);
    moments[0]!();
    expect(sent).toEqual([
      {
        sheetId: 's1',
        wid: 'w2',
        write: cells({ r: 'r1', c: 'c1', i: { n: 1 } }, { r: 'r2', c: 'c1', i: { n: 2 } }),
        flags: {},
      },
    ]);
    // The merged write takes the place of the writes it merged, after the one already in flight.
    expect(pending.get('s1')!.map((p) => p.wid)).toEqual(['old', 'w2']);
  });

  it('sends a lone write as it is, under its own wid', () => {
    const pending = new Map([['s1', [] as PendingWrite[]]]);
    const { batch, sent, moments } = harness(pending);
    batch.add('s1', one('r1', 1), { unchecked: true });
    moments[0]!();
    expect(sent).toEqual([
      { sheetId: 's1', wid: 'w0', write: one('r1', 1), flags: { unchecked: true } },
    ]);
    expect(pending.get('s1')!.map((p) => p.wid)).toEqual(['w0']);
  });

  it('never merges writes sent with different flags, nor across sheets', () => {
    const pending = new Map<string, PendingWrite[]>([
      ['s1', []],
      ['s2', []],
    ]);
    const { batch, sent, moments } = harness(pending);
    batch.add('s1', one('r1', 1), {});
    batch.add('s1', one('r2', 2), { undo: true });
    batch.add('s1', one('r3', 3), { undo: true });
    batch.add('s2', one('r4', 4), {});
    moments[0]!();
    expect(
      sent.map((s) => [s.sheetId, s.flags, s.write.kind === 'cells' && s.write.cells.length]),
    ).toEqual([
      ['s1', {}, 1],
      ['s1', { undo: true }, 2],
      ['s2', {}, 1],
    ]);
  });

  it('sends the writes of a sheet gone as they were made', () => {
    const { batch, sent, moments } = harness(new Map());
    batch.add('gone', one('r1', 1), {});
    batch.add('gone', one('r2', 2), {});
    moments[0]!();
    expect(sent.map((s) => s.wid)).toEqual(['w0', 'w1']);
  });

  it('sends as made when its writes are no longer pending', () => {
    const pending = new Map([['s1', [] as PendingWrite[]]]);
    const { batch, sent, moments } = harness(pending);
    batch.add('s1', one('r1', 1), {});
    batch.add('s1', one('r2', 2), {});
    pending.set('s1', []);
    moments[0]!();
    expect(sent.map((s) => s.wid)).toEqual(['w0', 'w1']);
  });

  it('sends everything at once when asked, and schedules again after', () => {
    const pending = new Map([['s1', [] as PendingWrite[]]]);
    const { batch, sent, moments } = harness(pending);
    batch.add('s1', one('r1', 1), {});
    batch.flush();
    expect(sent).toHaveLength(1);
    batch.add('s1', one('r2', 2), {});
    expect(moments).toHaveLength(2);
  });
});
