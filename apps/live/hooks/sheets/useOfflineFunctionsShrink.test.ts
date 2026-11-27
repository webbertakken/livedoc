// @vitest-environment jsdom
// formulas.md "Named functions" (D301): a This Browser spreadsheet's named functions shrunk in the browser.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord, type NamedFunction } from '@livedoc/sheets';
import { useOfflineFunctionsShrink } from './useOfflineFunctionsShrink';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({ apiSaveWorkbookFunctions: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');
const { apiSaveWorkbookFunctions } = await import('@/lib/api/workbook');

const scope = { ownerId: 'o', documentId: 'd1', shareCode: null };
const TWICE: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

beforeEach(() => vi.clearAllMocks());

describe('useOfflineFunctionsShrink', () => {
  it('is the api’s for a stored spreadsheet', () => {
    const { result } = renderHook(() => useOfflineFunctionsShrink(scope, false, vi.fn()));
    expect(result.current).toBeUndefined();
  });

  it('saves the shrunk list in this browser and applies it', async () => {
    const workbook = { ...record, functions: [TWICE] };
    vi.mocked(apiSaveWorkbookFunctions).mockResolvedValue({ workbook, rev: 0 });
    const onWorkbook = vi.fn();
    const { result } = renderHook(() => useOfflineFunctionsShrink(scope, true, onWorkbook));
    result.current!([TWICE]);
    await waitFor(() => expect(onWorkbook).toHaveBeenCalledWith(workbook));
    expect(apiSaveWorkbookFunctions).toHaveBeenCalledWith(scope, [TWICE]);
  });

  it('logs a save that does not land', async () => {
    vi.mocked(apiSaveWorkbookFunctions).mockRejectedValue(new Error('full'));
    const onWorkbook = vi.fn();
    const { result } = renderHook(() => useOfflineFunctionsShrink(scope, true, onWorkbook));
    result.current!([TWICE]);
    await waitFor(() =>
      expect(debugLog).toHaveBeenCalledWith('[workbook] offline named functions not shrunk', {
        error: 'Error: full',
      }),
    );
    expect(onWorkbook).not.toHaveBeenCalled();
  });
});
