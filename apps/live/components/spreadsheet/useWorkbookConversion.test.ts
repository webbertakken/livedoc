// @vitest-environment jsdom

// docs/specs/029-sheets/files-and-print.md "Converting" and "Download": the losses checked and listed first, Convert
// one undo step (undo and redo without the dialog), Download a converted copy, a failure said, nothing silent.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord } from '@livedoc/sheets';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { apiConvertWorkbook, apiWorkbookConversion } from '@/lib/api/workbook';
import { track } from '@/lib/telemetry';
import {
  CONVERT_FAILED,
  useWorkbookConversion,
  type WorkbookConversionDeps,
} from './useWorkbookConversion';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({
  apiWorkbookConversion: vi.fn(),
  apiConvertWorkbook: vi.fn(),
}));

const scope = { ownerId: 'o', documentId: 'd', shareCode: null };
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const losses = [{ k: 'text_cut' as const, count: 1 }];

let deps: WorkbookConversionDeps;
let steps: ItemUndoStep[];

beforeEach(() => {
  steps = [];
  deps = {
    scope,
    format: 'ods',
    onWorkbook: vi.fn(),
    pushUndo: (step) => void steps.push(step),
    download: vi.fn(async () => {}),
    setProblem: vi.fn(),
  };
  vi.mocked(apiWorkbookConversion).mockResolvedValue({ from: 'ods', to: 'xlsx', losses });
  vi.mocked(apiConvertWorkbook).mockImplementation(async (_, format) => ({
    workbook: WorkbookRecord.converted(record, format),
    rev: 1,
  }));
});

afterEach(() => vi.clearAllMocks());

const render = () => renderHook(() => useWorkbookConversion(deps));

describe('useWorkbookConversion', () => {
  it('checks, lists, converts as one undo step, and undoes and redoes without the dialog', async () => {
    const { result } = render();
    act(() => result.current.open('convert', 'xlsx'));
    expect(result.current.state).toEqual({ k: 'checking', purpose: 'convert', to: 'xlsx' });
    await waitFor(() => expect(result.current.state.k).toBe('listed'));
    expect(result.current.state).toMatchObject({ losses });
    act(() => result.current.confirm());
    expect(result.current.state.k).toBe('running');
    await waitFor(() => expect(result.current.state.k).toBe('closed'));
    expect(apiConvertWorkbook).toHaveBeenCalledWith(scope, 'xlsx');
    expect(deps.onWorkbook).toHaveBeenCalledWith(WorkbookRecord.converted(record, 'xlsx'));
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Converted', 'Xlsx');
    expect(steps).toHaveLength(1);
    steps[0]!.undo();
    await waitFor(() => expect(apiConvertWorkbook).toHaveBeenLastCalledWith(scope, 'ods'));
    steps[0]!.redo();
    await waitFor(() => expect(apiConvertWorkbook).toHaveBeenLastCalledWith(scope, 'xlsx'));
    expect(apiWorkbookConversion).toHaveBeenCalledTimes(1);
  });

  it('says a conversion that fails, and leaves no undo step', async () => {
    vi.mocked(apiConvertWorkbook).mockRejectedValue(new Error('offline'));
    const { result } = render();
    act(() => result.current.open('convert', 'xlsx'));
    await waitFor(() => expect(result.current.state.k).toBe('listed'));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.state.k).toBe('closed'));
    expect(deps.setProblem).toHaveBeenLastCalledWith(CONVERT_FAILED);
    expect(steps).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });

  it('downloads a converted copy after the list, and leaves the format alone', async () => {
    const { result } = render();
    act(() => result.current.open('download', 'xlsx'));
    await waitFor(() => expect(result.current.state.k).toBe('listed'));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.state.k).toBe('closed'));
    expect(deps.download).toHaveBeenCalledWith('xlsx');
    expect(apiConvertWorkbook).not.toHaveBeenCalled();
  });

  it('shows a failed check, tries again, and confirms nothing until listed', async () => {
    vi.mocked(apiWorkbookConversion).mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    act(() => result.current.open('convert', 'xlsx'));
    await waitFor(() => expect(result.current.state.k).toBe('failed'));
    act(() => result.current.confirm());
    expect(apiConvertWorkbook).not.toHaveBeenCalled();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.k).toBe('listed'));
    act(() => result.current.retry());
    expect(apiWorkbookConversion).toHaveBeenCalledTimes(2);
  });

  it('drops an answer for a dialog already cancelled, whether it lists or fails', async () => {
    let answer!: (value: Awaited<ReturnType<typeof apiWorkbookConversion>>) => void;
    let refuse!: (error: Error) => void;
    vi.mocked(apiWorkbookConversion)
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
    const { result } = render();
    act(() => result.current.open('convert', 'xlsx'));
    act(() => result.current.cancel());
    await act(async () => answer({ from: 'ods', to: 'xlsx', losses }));
    expect(result.current.state.k).toBe('closed');
    act(() => result.current.open('convert', 'xlsx'));
    act(() => result.current.cancel());
    await act(async () => refuse(new Error('late')));
    expect(result.current.state.k).toBe('closed');
  });

  it('runs without a record listener', async () => {
    deps.onWorkbook = undefined;
    const { result } = render();
    act(() => result.current.open('convert', 'xlsx'));
    await waitFor(() => expect(result.current.state.k).toBe('listed'));
    act(() => result.current.confirm());
    await waitFor(() => expect(steps).toHaveLength(1));
  });
});
