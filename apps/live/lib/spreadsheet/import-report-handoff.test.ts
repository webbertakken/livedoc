// @vitest-environment jsdom
// docs/specs/029-sheets/files-and-print.md "The import report" (D120): left for the spreadsheet a file made, waiting
// until closed; storage refused or a stored value of another shape shows none, and says so.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import {
  dismissImportReport,
  keepImportReport,
  subscribeImportReports,
  waitingImportReport,
} from './import-report-handoff';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(debugLog).mockClear();
  sessionStorage.clear();
});

const REPORT = { name: 'Budget', lines: ['1 chart sheet is left out: Chart1'] };

describe('the import report’s hand-over', () => {
  it('waits for the spreadsheet it was left for, the same report each read, until closed', () => {
    const heard = vi.fn();
    const stop = subscribeImportReports(heard);
    keepImportReport('doc-1', REPORT);
    expect(waitingImportReport('doc-2')).toBeNull();
    const waiting = waitingImportReport('doc-1');
    expect(waiting).toEqual(REPORT);
    expect(waitingImportReport('doc-1')).toBe(waiting);
    dismissImportReport('doc-1');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(waitingImportReport('doc-1')).toBeNull();
    stop();
    dismissImportReport('doc-1');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('shows none when storage refuses, and logs it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    keepImportReport('doc-1', REPORT);
    expect(debugLog).toHaveBeenCalledWith('[workbook] import report not kept', {
      error: 'Error: quota',
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(waitingImportReport('doc-1')).toBeNull();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    dismissImportReport('doc-1');
    expect(debugLog).toHaveBeenCalledWith('[workbook] import report not dismissed', {
      error: 'Error: denied',
    });
  });

  it('shows none for a stored value of another shape', () => {
    for (const stored of [
      'not json',
      'null',
      '7',
      '{"name":"A","lines":[]}',
      '{"name":"A","lines":[1]}',
      '{"name":1,"lines":["x"]}',
      '{"name":"A","lines":"x"}',
    ]) {
      sessionStorage.setItem('livedoc:import-report:doc-1', stored);
      expect(waitingImportReport('doc-1')).toBeNull();
    }
    expect(debugLog).toHaveBeenCalledWith('[workbook] import report unreadable', {
      documentId: 'doc-1',
    });
  });
});
