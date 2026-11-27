// @vitest-environment jsdom
// formulas.md "Named functions" (D301): the named functions a person's layout change rewrites, saved in turn.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord, type NamedFunction } from '@livedoc/sheets';
import { useFunctionsChanges } from './useFunctionsChanges';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({ apiSaveWorkbookFunctions: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');
const { apiSaveWorkbookFunctions } = await import('@/lib/api/workbook');

const scope = { ownerId: 'o', documentId: 'd1', shareCode: null };
const TWICE: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };
const THRICE: NamedFunction = { name: 'THRICE', params: ['x'], body: '=x*3' };
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiSaveWorkbookFunctions).mockImplementation(async (_s, functions) => ({
    workbook: { ...record, functions: [...functions] },
    rev: 1,
  }));
});

describe('useFunctionsChanges', () => {
  it('saves each change in turn, each against the list the one before left', async () => {
    const onWorkbook = vi.fn();
    const { result } = renderHook(() => useFunctionsChanges(scope, [TWICE], onWorkbook));
    const seen: (readonly NamedFunction[])[] = [];
    result.current((now) => (seen.push(now), [...now, THRICE]));
    result.current((now) => (seen.push(now), now.slice(1)));
    await waitFor(() => expect(onWorkbook).toHaveBeenCalledTimes(2));
    expect(seen).toEqual([[TWICE], [TWICE, THRICE]]);
    expect(apiSaveWorkbookFunctions).toHaveBeenLastCalledWith(scope, [THRICE]);
    expect(onWorkbook).toHaveBeenLastCalledWith({ ...record, functions: [THRICE] });
  });

  it('works a change out against the record as it now stands', async () => {
    const onWorkbook = vi.fn();
    const { result, rerender } = renderHook(
      ({ functions }) => useFunctionsChanges(scope, functions, onWorkbook),
      { initialProps: { functions: [TWICE] as readonly NamedFunction[] } },
    );
    rerender({ functions: [THRICE] });
    const change = vi.fn(() => null);
    result.current(change);
    await waitFor(() => expect(change).toHaveBeenCalledWith([THRICE]));
    expect(apiSaveWorkbookFunctions).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[workbook] named functions unchanged by the layout', {});
  });

  it('logs a save that does not land, and goes on with the next', async () => {
    vi.mocked(apiSaveWorkbookFunctions).mockRejectedValueOnce(new Error('full'));
    const onWorkbook = vi.fn();
    const { result } = renderHook(() => useFunctionsChanges(scope, undefined, onWorkbook));
    result.current(() => [TWICE]);
    result.current((now) => [...now, THRICE]);
    await waitFor(() => expect(onWorkbook).toHaveBeenCalledTimes(1));
    expect(debugLog).toHaveBeenCalledWith('[workbook] named functions not saved for the layout', {
      error: 'Error: full',
    });
    expect(apiSaveWorkbookFunctions).toHaveBeenLastCalledWith(scope, [THRICE]);
  });
});
