// @vitest-environment jsdom
// data-tools.md "Named ranges and named functions": Data › Named Functions' panel lists the workbook's named functions,
// and lets an Editor create, edit and remove one, each saved whole as one undo step; others read it.
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord, type NamedFunction } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  SHEET_ID,
  stubResizeObserver,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { OpenPanels } from '@/lib/office/office-panels';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { ApiError } from '@/lib/api/core';
import { SpreadsheetRightPanel } from './SpreadsheetRightPanel';
import { NO_FUNCTIONS_READ, NO_FUNCTIONS_YET } from './SpreadsheetNamedFunctionsBody';
import {
  FUNCTIONS_FULL,
  FUNCTIONS_NOT_SAVED,
  FUNCTIONS_REFUSED,
  NamedFunctionsProvider,
  useNamedFunctionsState,
  type NamedFunctionsState,
} from './named-functions-state';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({ apiSaveWorkbookFunctions: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');
const { track } = await import('@/lib/telemetry');
const { apiSaveWorkbookFunctions } = await import('@/lib/api/workbook');

beforeAll(stubResizeObserver);
beforeEach(() => vi.clearAllMocks());

const panels: OfficePanelsState = {
  open: { ...OpenPanels.none, right: 'named-functions' },
  actions: {},
  close: vi.fn(),
  reveal: vi.fn(),
  focusNonce: 0,
  width: 360,
  setWidth: vi.fn(),
  saveWidth: vi.fn(),
};

const CONTAINS: NamedFunction = {
  name: 'CONTAINS',
  params: ['search_query', 'search_range'],
  body: '=NOT(ISERROR(MATCH(search_query, search_range, 0)))',
  description: 'Whether the range holds the value',
};
const TWICE: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };

// The panel over a list kept in state, each save landing at once (or refused when `refuse` says so).
function show(
  h: SheetHarness,
  start: readonly NamedFunction[],
  opts: { canShape?: boolean; refuse?: boolean } = {},
) {
  const saves: (readonly NamedFunction[])[] = [];
  function Functions({ children }: { children: React.ReactNode }) {
    const [functions, setFunctions] = useState(start);
    const state: NamedFunctionsState = {
      functions,
      save: async (next) => {
        saves.push(next);
        if (opts.refuse) return false;
        setFunctions(next);
        return true;
      },
    };
    return <NamedFunctionsProvider value={state}>{children}</NamedFunctionsProvider>;
  }
  renderSheet(
    h,
    ({ actions }) => (
      <Functions>
        <SpreadsheetRightPanel panels={panels} actions={actions} />
      </Functions>
    ),
    { canShape: opts.canShape ?? true },
  );
  return saves;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the Named Functions panel', () => {
  it('lists each function’s call and description in name order', async () => {
    show(await makeSheet(), [TWICE, CONTAINS]);
    const rows = within(screen.getByRole('list', { name: 'Named functions' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      'CONTAINS(search_query, search_range)Whether the range holds the value',
      'TWICE(x)',
    ]);
  });

  it('says none to an Editor', async () => {
    show(await makeSheet(), []);
    expect(screen.getByText(NO_FUNCTIONS_YET)).toBeTruthy();
  });

  it('is read only for a Participant or Viewer', async () => {
    show(await makeSheet(), [CONTAINS], { canShape: false });
    expect(screen.queryByRole('button', { name: 'Edit CONTAINS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove CONTAINS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add New Function' })).toBeNull();
  });

  it('says none to a reader', async () => {
    show(await makeSheet(), [], { canShape: false });
    expect(screen.getByText(NO_FUNCTIONS_READ)).toBeTruthy();
  });

  it('creates a function with its arguments, details and definition', async () => {
    const saves = show(await makeSheet(), [TWICE]);
    fireEvent.click(screen.getByRole('button', { name: 'Add New Function' }));
    type('Function Name', 'contains');
    type('Function Description', 'Whether the range holds the value');
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    type('Argument 1', 'search_query');
    type('Argument 2', 'search_range');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Argument 3' }));
    type('Formula Definition', CONTAINS.body);
    fireEvent.click(screen.getByRole('button', { name: 'Argument Details' }));
    type('search_query Description', 'The value');
    type('search_query Example', '"x"');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(saves).toEqual([
      [{ ...CONTAINS, hints: [{ description: 'The value', example: '"x"' }] }, TWICE],
    ]);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'NamedFunction');
    expect(screen.getByRole('button', { name: 'Edit CONTAINS' })).toBeTruthy();
  });

  it('says why under the field it refuses, and logs the field', async () => {
    const saves = show(await makeSheet(), [TWICE]);
    fireEvent.click(screen.getByRole('button', { name: 'Add New Function' }));
    type('Function Name', 'twice');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(screen.getByRole('alert').textContent).toBe('Another named function is called that');
    expect(screen.getByLabelText('Function Name').getAttribute('aria-describedby')).toBe(
      screen.getByRole('alert').id,
    );
    expect(debugLog).toHaveBeenCalledWith('[workbook] named function refused', { field: 'name' });
    type('Function Name', 'thrice');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    type('Argument 1', 'A1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(screen.getByRole('alert').textContent).toBe('That reads as a cell reference');
    type('Argument 1', 'x');
    type('Formula Definition', '=x*(');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(screen.getByRole('alert').textContent).toBe("That formula can't be read");
    type('Function Description', 'd'.repeat(1_001));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(screen.getByRole('alert').textContent).toMatch(/A description holds up to/);
    expect(saves).toEqual([]);
  });

  it('edits a function in its place, renamed', async () => {
    const saves = show(await makeSheet(), [CONTAINS, TWICE]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit TWICE' }));
    expect(screen.getByLabelText<HTMLInputElement>('Argument 1').value).toBe('x');
    type('Function Name', 'double');
    type('Formula Definition', '=x+x');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));
    expect(saves).toEqual([[CONTAINS, { ...TWICE, name: 'DOUBLE', body: '=x+x' }]]);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'NamedFunction');
  });

  it('saves a reference naming the sheet open, absolute, and shows it so', async () => {
    const h = await makeSheet();
    const sheet = h.store.sheet(SHEET_ID)!;
    expect(sheet.title).toBe('Sheet 1');
    const saves = show(h, []);
    fireEvent.click(screen.getByRole('button', { name: 'Add New Function' }));
    type('Function Name', 'scaled');
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    type('Argument 1', 'x');
    type('Formula Definition', '=x*B2');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    const saved = saves[0]![0]!;
    expect(saved.body).toBe('=x*@0');
    expect(saved.refs).toEqual([
      { s: SHEET_ID, r1: sheet.layout.rows[1], c1: sheet.layout.cols[1], a: 15 },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit SCALED' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('Formula Definition').value).toBe(
      "=x*'Sheet 1'!$B$2",
    );
  });

  it('keeps the form open when the save does not land, and Cancel goes back', async () => {
    show(await makeSheet(), [TWICE], { refuse: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit TWICE' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));
    expect(screen.getByRole('form', { name: 'Edit TWICE' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit TWICE' })).toBeTruthy();
  });

  it('removes a function', async () => {
    const saves = show(await makeSheet(), [CONTAINS, TWICE]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove CONTAINS' })));
    expect(saves).toEqual([[TWICE]]);
    expect(screen.queryByRole('button', { name: 'Edit CONTAINS' })).toBeNull();
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'NamedFunction');
  });

  it('opens Argument Details only with arguments', async () => {
    show(await makeSheet(), []);
    fireEvent.click(screen.getByRole('button', { name: 'Add New Function' }));
    expect(screen.queryByRole('button', { name: 'Argument Details' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Argument' }));
    fireEvent.click(screen.getByRole('button', { name: 'Argument Details' }));
    expect(screen.getByLabelText('Argument 1 Description')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Argument Details' }));
    expect(screen.queryByLabelText('Argument 1 Description')).toBeNull();
  });
});

describe('useNamedFunctionsState', () => {
  const scope = { documentId: 'd1', ownerId: 'o', shareCode: null };
  const record = { ...WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }) };

  function hook(functions: readonly NamedFunction[] = []) {
    const onWorkbook = vi.fn();
    const host = { pushUndo: vi.fn(), toast: vi.fn() };
    const view = renderHook(() =>
      useNamedFunctionsState(
        scope,
        functions.length ? { ...record, functions } : record,
        onWorkbook,
        host,
      ),
    );
    return { view, onWorkbook, host };
  }

  it('saves the list whole, applies the answer and pushes one undo step', async () => {
    const saved = { ...record, functions: [TWICE] };
    vi.mocked(apiSaveWorkbookFunctions).mockResolvedValue({ workbook: saved, rev: 1 });
    const { view, onWorkbook, host } = hook([CONTAINS]);
    expect(view.result.current.functions).toEqual([CONTAINS]);
    expect(await view.result.current.save([TWICE])).toBe(true);
    expect(apiSaveWorkbookFunctions).toHaveBeenCalledWith(scope, [TWICE]);
    expect(onWorkbook).toHaveBeenCalledWith(saved);
    const step = host.pushUndo.mock.calls[0]![0] as { undo: () => void; redo: () => void };
    step.undo();
    await waitFor(() =>
      expect(apiSaveWorkbookFunctions).toHaveBeenLastCalledWith(scope, [CONTAINS]),
    );
    step.redo();
    await waitFor(() => expect(apiSaveWorkbookFunctions).toHaveBeenLastCalledWith(scope, [TWICE]));
  });

  it.each([
    [new ApiError('save named functions', 400, 'functions_invalid'), FUNCTIONS_REFUSED],
    [new ApiError('save named functions', 413, 'functions_full'), FUNCTIONS_FULL],
    [new ApiError('save named functions', 500, null), FUNCTIONS_NOT_SAVED],
    [new Error('offline'), FUNCTIONS_NOT_SAVED],
  ])('toasts a save that does not land (%s)', async (error, message) => {
    vi.mocked(apiSaveWorkbookFunctions).mockRejectedValue(error);
    const { view, host } = hook();
    expect(await view.result.current.save([TWICE])).toBe(false);
    expect(host.toast).toHaveBeenCalledWith(message);
    expect(host.pushUndo).not.toHaveBeenCalled();
  });
});
