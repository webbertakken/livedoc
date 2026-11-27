// @vitest-environment jsdom
// data-tools.md "Named ranges and named functions": Import Function's picker, then the picked spreadsheet's named
// functions with ticks, Import All and Import; a call left behind is named beside its function.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import type { FunctionSource, NamedFunction } from '@livedoc/sheets';
import { apiListDocuments } from '@/lib/api/documents';
import { apiFunctionSource } from '@/lib/api/workbook';
import { ImportFunctionDialog } from './ImportFunctionDialog';

vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({ apiFunctionSource: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');

const TWICE: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2', description: 'Doubles' };
const QUAD: NamedFunction = { name: 'QUAD', params: ['x'], body: '=TWICE(TWICE(x))' };
const source: FunctionSource = { functions: [TWICE, QUAD], sheets: [] };
const documents = [
  { id: 'here', name: 'This one', spreadsheet: true },
  { id: 'b1', name: 'Budget', spreadsheet: true },
] as DocumentSummary[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiListDocuments).mockResolvedValue(documents);
});

function open(here: readonly NamedFunction[] = []) {
  const onImport = vi.fn();
  const onClose = vi.fn();
  render(
    <ImportFunctionDialog
      ownerId="o"
      currentId="here"
      here={here}
      onImport={onImport}
      onClose={onClose}
    />,
  );
  return { onImport, onClose };
}

async function pickBudget() {
  fireEvent.click(await screen.findByRole('button', { name: 'Budget' }));
}

describe('ImportFunctionDialog', () => {
  it('lists the picked spreadsheet’s functions in name order, and imports the ticked ones', async () => {
    vi.mocked(apiFunctionSource).mockResolvedValue(source);
    const { onImport } = open();
    expect(screen.queryByRole('button', { name: 'This one' })).toBeNull();
    await pickBudget();
    expect(screen.getByRole('status').textContent).toBe('Loading its named functions…');
    const list = await screen.findByRole('list', { name: 'Its named functions' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((r) => r.textContent),
    ).toEqual(['QUAD(x)', 'TWICE(x)Doubles']);
    expect(apiFunctionSource).toHaveBeenCalledWith('o', 'b1');
    const importOne = screen.getByRole('button', { name: 'Import' });
    expect(importOne.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'TWICE(x)Doubles' }));
    fireEvent.click(importOne);
    expect(onImport).toHaveBeenCalledWith([TWICE], source);
  });

  it('imports all, and says beside a function the call it leaves behind', async () => {
    vi.mocked(apiFunctionSource).mockResolvedValue(source);
    const { onImport } = open();
    await pickBudget();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'QUAD(x)' }));
    expect(screen.getByText('Calls TWICE, which is not imported')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'TWICE(x)Doubles' }));
    expect(screen.queryByText(/which is not imported/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'TWICE(x)Doubles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import All' }));
    expect(onImport).toHaveBeenCalledWith([QUAD, TWICE], source);
  });

  it('names several left behind, and none that is here already', async () => {
    const PAIR: NamedFunction = { name: 'PAIR', params: ['x'], body: '=QUAD(x)+TWICE(x)' };
    vi.mocked(apiFunctionSource).mockResolvedValue({
      functions: [PAIR, ...source.functions],
      sheets: [],
    });
    open();
    await pickBudget();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'PAIR(x)' }));
    expect(screen.getByText('Calls QUAD, TWICE, which are not imported')).toBeTruthy();
    cleanup();
    open([TWICE]);
    await pickBudget();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'PAIR(x)' }));
    expect(screen.getByText('Calls QUAD, which is not imported')).toBeTruthy();
  });

  it('says when it has none, and goes back to the picker', async () => {
    vi.mocked(apiFunctionSource).mockResolvedValue({ functions: [], sheets: [] });
    const { onClose } = open();
    await pickBudget();
    expect(await screen.findByText('That spreadsheet has no named functions.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import All' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Budget' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says when they cannot be read, logs it, and tries again', async () => {
    vi.mocked(apiFunctionSource).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(apiFunctionSource).mockResolvedValueOnce(source);
    open();
    await pickBudget();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Its named functions could not be read.',
    );
    expect(debugLog).toHaveBeenCalledWith('[workbook] import function source failed', {
      error: 'Error: offline',
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try Again' })));
    expect(await screen.findByRole('list', { name: 'Its named functions' })).toBeTruthy();
  });
});
