// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "Reading a sheet from another document", D505: a dashboard's reads of a
// spreadsheet's sheet, asked once by every slot showing it, again every LINK_REFRESH_MS while shown and the page
// visible, with the version held; a refusal said as no access or too large; a failed ask keeps the last read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLayout, type SheetJson } from '@livedoc/sheets';
import type { WorkbookLinkAnswer } from '@/lib/api/workbook-link';
import {
  forgetLinkedReads,
  LINK_REFRESH_MS,
  linkedRead,
  retryLinkedRead,
  subscribeLinkedRead,
} from './linked-sheets';

const fetchLink = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<WorkbookLinkAnswer>>());
vi.mock('@/lib/api/workbook-link', () => ({ fetchWorkbookLink: fetchLink }));

let n = 3;
const layout = emptyLayout(() => (n = (n * 16807 + 11) % 2147483647) / 2147483647, 4, 3);
const sheet = (value: number): SheetJson => ({
  id: 'sheet1',
  tabId: 'tab1',
  title: 'Budget',
  layout,
  cells: [{ r: layout.rows[0]!, c: layout.cols[0]!, i: { n: value } }],
  rev: 0,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: { id: '', name: '', color: '#000000' },
});
const read = (version: string, value: number): WorkbookLinkAnswer => ({
  kind: 'read',
  body: {
    version,
    name: 'Money',
    locale: 'en-GB',
    sheets: [{ id: 'sheet1', title: 'Budget' }],
    sheet: sheet(value),
  },
});
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  fetchLink.mockReset();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  forgetLinkedReads();
  vi.useRealTimers();
});

describe('a linked read', () => {
  it('asks once for every slot showing the sheet, and is ready with the sheet worked out', async () => {
    fetchLink.mockResolvedValue(read('v1', 42));
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeLinkedRead('owner', 'doc1', 'sheet1', a);
    const stopB = subscribeLinkedRead('owner', 'doc1', 'sheet1', b);
    expect(linkedRead('doc1', 'sheet1')).toEqual({ state: 'loading' });
    await settle();
    expect(fetchLink).toHaveBeenCalledTimes(1);
    expect(fetchLink).toHaveBeenCalledWith('owner', 'doc1', 'sheet1', null);
    const got = linkedRead('doc1', 'sheet1');
    if (got.state !== 'ready') throw new Error(got.state);
    expect(got.wb.value('sheet1', 0, 0)).toBe(42);
    expect(got.sheets).toEqual([{ id: 'sheet1', title: 'Budget' }]);
    expect(got.name).toBe('Money');
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    stopA();
    stopB();
  });

  it('asks again every LINK_REFRESH_MS with its version, taking a new read and keeping an unchanged one', async () => {
    fetchLink.mockResolvedValueOnce(read('v1', 1));
    const stop = subscribeLinkedRead('owner', 'doc1', 'sheet1', () => {});
    await settle();
    const first = linkedRead('doc1', 'sheet1');
    fetchLink.mockResolvedValueOnce({ kind: 'read', body: { unchanged: true, version: 'v1' } });
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS);
    expect(fetchLink).toHaveBeenLastCalledWith('owner', 'doc1', 'sheet1', 'v1');
    expect(linkedRead('doc1', 'sheet1')).toBe(first);
    fetchLink.mockResolvedValueOnce(read('v2', 2));
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS);
    const next = linkedRead('doc1', 'sheet1');
    if (next.state !== 'ready' || first.state !== 'ready') throw new Error('not ready');
    expect(next.wb.value('sheet1', 0, 0)).toBe(2);
    expect(next.version).toBeGreaterThan(first.version);
    stop();
  });

  it('asks nothing while the page is hidden, nor once no slot shows it', async () => {
    fetchLink.mockResolvedValue(read('v1', 1));
    const stop = subscribeLinkedRead('owner', 'doc1', 'sheet1', () => {});
    await settle();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS * 3);
    expect(fetchLink).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    stop();
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS * 3);
    expect(fetchLink).toHaveBeenCalledTimes(1);
    // The last read stays for a picture of the dashboard.
    expect(linkedRead('doc1', 'sheet1').state).toBe('ready');
  });

  it('says a spreadsheet the reader may not open, or one too large, as such', async () => {
    fetchLink.mockResolvedValueOnce({ kind: 'denied' });
    const stop = subscribeLinkedRead('owner', 'doc1', 'sheet1', () => {});
    await settle();
    expect(linkedRead('doc1', 'sheet1')).toEqual({ state: 'denied' });
    fetchLink.mockResolvedValueOnce({ kind: 'too-large' });
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS);
    expect(linkedRead('doc1', 'sheet1')).toEqual({ state: 'too-large' });
    stop();
  });

  it('fails with a Retry when its first ask fails, and keeps the last read when a later one does', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchLink.mockRejectedValueOnce(new Error('offline'));
    const stop = subscribeLinkedRead('owner', 'doc1', 'sheet1', () => {});
    await settle();
    expect(linkedRead('doc1', 'sheet1')).toEqual({ state: 'failed' });
    fetchLink.mockResolvedValueOnce(read('v1', 5));
    retryLinkedRead('doc1', 'sheet1');
    await settle();
    const ready = linkedRead('doc1', 'sheet1');
    expect(ready.state).toBe('ready');
    fetchLink.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(LINK_REFRESH_MS);
    expect(linkedRead('doc1', 'sheet1')).toBe(ready);
    expect(warn).toHaveBeenCalledWith('[dashboard] linked sheet read failed', {
      documentId: 'doc1',
      sheetId: 'sheet1',
      error: 'Error: offline',
    });
    stop();
  });

  it('reads nothing of a link it was never asked for', () => {
    expect(linkedRead('doc9', 'sheet9')).toEqual({ state: 'loading' });
    retryLinkedRead('doc9', 'sheet9');
    expect(fetchLink).not.toHaveBeenCalled();
  });
});
