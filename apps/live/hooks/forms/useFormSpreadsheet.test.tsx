// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormDefinition } from '@livedoc/forms';
import { ApiError } from '@/lib/api/core';
import type { LinkedRead } from '@/components/plan/dashboard/linked-sheets';
import {
  CONNECT_REFUSED,
  MAKE_FAILED,
  RESPONSES_SHEET_NAME,
  spreadsheetProblem,
  useFormSpreadsheet,
} from './useFormSpreadsheet';

// docs/specs/029-sheets/plan-links.md "Form responses" (D506): a spreadsheet is connected before the form names it,
// New Spreadsheet makes one in the form's folder, and a change of spreadsheet takes the old connection back.

const api = vi.hoisted(() => ({
  connectFormToSheet: vi.fn(async () => ({})),
  unlinkFormFromSheet: vi.fn(async () => ({})),
  apiCreateDocument: vi.fn(async () => ({})),
  apiDeleteDocument: vi.fn(async () => {}),
  read: { state: 'loading' } as LinkedRead,
}));
vi.mock('@/lib/api/workbook-link', () => ({
  connectFormToSheet: api.connectFormToSheet,
  unlinkFormFromSheet: api.unlinkFormFromSheet,
}));
vi.mock('@/lib/api-client', async (actual) => ({
  ...(await actual<typeof import('@/lib/api-client')>()),
  apiCreateDocument: api.apiCreateDocument,
  apiDeleteDocument: api.apiDeleteDocument,
}));
vi.mock('@/components/plan/dashboard/useLinkedSheetRead', () => ({
  useLinkedRead: () => api.read,
}));

afterEach(() => vi.clearAllMocks());

const form = (sheet?: FormDefinition['sheet']): FormDefinition => ({
  v: 1,
  heading: 'Feedback',
  sections: [],
  ...(sheet ? { sheet } : {}),
});

function setup(initial = form(), place: { folderId?: string } = { folderId: 'f1' }) {
  const setSheet = vi.fn();
  const hook = renderHook(
    ({ f, canEdit }) =>
      useFormSpreadsheet({
        form: f,
        formDocumentId: 'd1',
        formTabId: 'ftab',
        ownerId: 'me',
        canEdit,
        place,
        setSheet,
      }),
    { initialProps: { f: initial, canEdit: true } },
  );
  return { hook, setSheet };
}

describe('useFormSpreadsheet', () => {
  it('connects a spreadsheet’s sheet before the form names it', async () => {
    const { hook, setSheet } = setup();
    await act(() => hook.result.current.choose({ documentId: 'ss', sheetId: 'sheet1' }));
    expect(api.connectFormToSheet).toHaveBeenCalledWith('me', 'ss', {
      documentId: 'd1',
      tabId: 'ftab',
      sheetId: 'sheet1',
    });
    expect(setSheet).toHaveBeenCalledWith({ documentId: 'ss', sheetId: 'sheet1' });
    // The change it made is not connected twice.
    hook.rerender({ f: form({ documentId: 'ss', sheetId: 'sheet1' }), canEdit: true });
    expect(api.connectFormToSheet).toHaveBeenCalledOnce();
  });

  it('names nothing when the connection is refused, and says why', async () => {
    api.connectFormToSheet.mockRejectedValueOnce(new ApiError('connect form', 403, 'forbidden'));
    const { hook, setSheet } = setup();
    await act(() => hook.result.current.choose({ documentId: 'ss', sheetId: 'sheet1' }));
    expect(setSheet).not.toHaveBeenCalled();
    expect(hook.result.current.failure).toBe(CONNECT_REFUSED);
    expect(hook.result.current.busy).toBe(false);
  });

  it('makes a new spreadsheet in the form’s folder, then connects it', async () => {
    const { hook, setSheet } = setup();
    await act(() => hook.result.current.makeNew());
    const [, made] = api.apiCreateDocument.mock.calls[0]! as unknown as [
      string,
      { id: string; name: string; folderId?: string; sheets: { id: string; title: string }[] },
    ];
    expect(made).toMatchObject({ name: 'Feedback Responses', folderId: 'f1' });
    expect(made.sheets[0]!.title).toBe(RESPONSES_SHEET_NAME);
    expect(setSheet).toHaveBeenCalledWith({ documentId: made.id, sheetId: made.sheets[0]!.id });
  });

  it('bins a new spreadsheet it could not connect, and says it failed', async () => {
    api.connectFormToSheet.mockRejectedValueOnce(new Error('offline'));
    const { hook, setSheet } = setup(form(), {});
    await act(() => hook.result.current.makeNew());
    const [, made] = api.apiCreateDocument.mock.calls[0]! as unknown as [string, { id: string }];
    expect(made).not.toHaveProperty('folderId');
    expect(api.apiDeleteDocument).toHaveBeenCalledWith('me', made.id);
    expect(setSheet).not.toHaveBeenCalled();
    expect(hook.result.current.failure).toBe(MAKE_FAILED);
  });

  it('takes the old spreadsheet’s connection back when the form moves to another', async () => {
    const { hook } = setup(form({ documentId: 'old', sheetId: 'sheetA' }));
    await act(() => hook.result.current.choose({ documentId: 'new', sheetId: 'sheetB' }));
    expect(api.unlinkFormFromSheet).toHaveBeenCalledWith('me', 'old', {
      documentId: 'd1',
      tabId: 'ftab',
    });
  });

  it('connects a change made elsewhere (an undo), and lets the old one go', () => {
    const { hook } = setup(form({ documentId: 'old', sheetId: 'sheetA' }));
    hook.rerender({ f: form(), canEdit: true });
    expect(api.unlinkFormFromSheet).toHaveBeenCalledWith('me', 'old', expect.anything());
    hook.rerender({ f: form({ documentId: 'old', sheetId: 'sheetA' }), canEdit: true });
    expect(api.connectFormToSheet).toHaveBeenCalledWith('me', 'old', expect.anything());
  });

  it('asks nothing for someone who may not edit the form', () => {
    const { hook } = setup(form({ documentId: 'old', sheetId: 'sheetA' }));
    hook.rerender({ f: form(), canEdit: false });
    expect(api.unlinkFormFromSheet).not.toHaveBeenCalled();
  });
});

describe('spreadsheetProblem', () => {
  it('reads no access, a removed sheet, and nothing while loading', () => {
    expect(spreadsheetProblem(null)).toBeNull();
    expect(spreadsheetProblem({ state: 'loading' })).toBeNull();
    expect(spreadsheetProblem({ state: 'denied' })).toBe('spreadsheet_denied');
    expect(spreadsheetProblem({ state: 'ready', sheet: null } as unknown as LinkedRead)).toBe(
      'sheet_missing',
    );
  });
});
