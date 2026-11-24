// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { apiDownloadWorkbook, apiWorkbookConversion } from '@/lib/api/workbook';
import { downloadBlob } from '@/lib/download-blob';
import { openSpreadsheetFile } from '@/lib/spreadsheet/open-spreadsheet-file';
import type { SpreadsheetHistory } from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { track } from '@/lib/telemetry';
import { createOfficeBindingsChannel } from './office-bindings-channel';
import { SpreadsheetTitleRow, spreadsheetLevel } from './SpreadsheetTitleRow';
import { useSpreadsheetZoom } from './spreadsheet-zoom';
import { useShowFormulas } from '@/components/sheets/show-formulas';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/api/workbook', () => ({
  apiDownloadWorkbook: vi.fn(),
  apiWorkbookConversion: vi.fn(),
  apiConvertWorkbook: vi.fn(),
}));
vi.mock('@/lib/spreadsheet/open-spreadsheet-file', async (load) => ({
  ...(await load<object>()),
  openSpreadsheetFile: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const SCOPE = { ownerId: 'o1', documentId: 'd1', shareCode: null };
const fullScreen = vi.fn();

function Row({
  level = 'edit',
  history = null,
  channel = createOfficeBindingsChannel(),
}: {
  level?: AccessLevel;
  history?: SpreadsheetHistory | null;
  channel?: ReturnType<typeof createOfficeBindingsChannel>;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const [pushed] = useState(() => vi.fn());
  const { zoom } = useSpreadsheetZoom();
  const formulas = useShowFormulas();
  return (
    <div ref={root}>
      <SpreadsheetTitleRow
        scope={SCOPE}
        tabId="t1"
        format="ods"
        locale="en-GB"
        documentName=""
        level={level}
        history={history}
        channel={channel}
        zoom={zoom}
        formulas={formulas}
        onFullScreen={fullScreen}
        keyScope={root}
        onWorkbook={undefined}
        pushUndo={pushed}
      />
    </div>
  );
}

const openMenu = (name: string) =>
  fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name }));
const item = (name: string | RegExp) => screen.getByRole('menuitem', { name });
const openSub = (name: string) => fireEvent.click(item(new RegExp(`^${name}`)));

describe('spreadsheetLevel', () => {
  it('reads a Viewer, a Participant and an Editor from the sheet’s two permissions', () => {
    expect(spreadsheetLevel(false, false)).toBe('view');
    expect(spreadsheetLevel(true, false)).toBe('participate');
    expect(spreadsheetLevel(true, true)).toBe('edit');
  });
});

// docs/specs/029-sheets/surface.md "Menu bar"; files-and-print.md "Download", "Converting".
describe('SpreadsheetTitleRow', () => {
  it('names an unnamed spreadsheet and sends the menus’ telemetry as a spreadsheet’s (D127)', () => {
    render(<Row />);
    expect(screen.getByText('Untitled spreadsheet')).toBeTruthy();
    openMenu('Data');
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'SpreadsheetMenuData');
  });

  // grid-and-editing.md "Formulas" (D141): View › Show › Formulas is the person's view, ticked while on.
  it('ticks View › Show › Formulas once pressed', () => {
    render(<Row />);
    openMenu('View');
    openSub('Show');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Formulas/ }));
    openMenu('View');
    openSub('Show');
    expect(
      screen.getByRole('menuitemcheckbox', { name: /^Formulas/ }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  // surface.md "Layout": View › Full Screen, open to a Viewer (D188).
  it('runs View › Full Screen, for a Viewer too', () => {
    render(<Row level="view" />);
    openMenu('View');
    fireEvent.click(item(/^Full Screen/));
    expect(fullScreen).toHaveBeenCalledOnce();
  });

  it('runs the open sheet’s items from the channel, ticked as it says', () => {
    const channel = createOfficeBindingsChannel();
    const bold = vi.fn();
    render(<Row channel={channel} />);
    act(() =>
      channel.set({
        recentCodes: [],
        colours: null,
        actions: { bold: { run: bold, checked: true } },
        fontSize: 10,
        setFontSize: () => {},
        fontFamily: null,
        setFontFamily: () => {},
        borders: null,
      }),
    );
    openMenu('Format');
    openSub('Text');
    const boldItem = screen.getByRole('menuitemcheckbox', { name: /Bold/ });
    expect(boldItem.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(boldItem);
    expect(bold).toHaveBeenCalled();
  });

  it('draws the toolbar from the open sheet: Bold pressed, the size field set through it', () => {
    const channel = createOfficeBindingsChannel();
    const bold = vi.fn();
    const setFontSize = vi.fn();
    const setFontFamily = vi.fn();
    render(<Row channel={channel} />);
    act(() =>
      channel.set({
        recentCodes: [],
        colours: null,
        actions: {
          bold: { run: bold, checked: true },
          'align-left': { run: vi.fn(), checked: true },
        },
        fontSize: 12,
        setFontSize,
        fontFamily: 'Arial',
        setFontFamily,
        borders: null,
      }),
    );
    const toolbar = screen.getByRole('toolbar');
    const boldButton = within(toolbar).getByRole('button', { name: /^Bold/ });
    expect(boldButton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(boldButton);
    expect(bold).toHaveBeenCalled();
    const size = within(toolbar).getByRole<HTMLInputElement>('combobox', { name: /Font Size/i });
    expect(size.value).toBe('12');
    fireEvent.change(size, { target: { value: '14' } });
    fireEvent.keyDown(size, { key: 'Enter' });
    expect(setFontSize).toHaveBeenCalledWith(14);
    // formatting.md "Font": the active cell’s family, Arial for none, a family chosen set through the sheet.
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Font: Arial' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Lora' }));
    expect(setFontFamily).toHaveBeenCalledWith('Lora');
    expect(within(toolbar).getByRole('button', { name: /Horizontal Align: Left/ })).toBeTruthy();
  });

  // formatting.md "Borders": an Editor's toolbar opens the Borders panel, a placement drawn through the sheet.
  it('opens the Borders panel from the toolbar, a placement drawn through the open sheet', () => {
    const channel = createOfficeBindingsChannel();
    const apply = vi.fn();
    render(<Row channel={channel} />);
    act(() =>
      channel.set({
        recentCodes: [],
        colours: null,
        actions: {},
        fontSize: 10,
        setFontSize: () => {},
        fontFamily: 'Arial',
        setFontFamily: () => {},
        borders: { apply, colour: '#000000', setColour: vi.fn(), line: 'thin', setLine: vi.fn() },
      }),
    );
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Borders' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Borders' })).getByRole('button', {
        name: 'Outer Borders',
      }),
    );
    expect(apply).toHaveBeenCalledWith('outer');
    expect(screen.queryByRole('dialog', { name: 'Borders' })).toBeNull();
  });

  // surface.md "Grid": View › Zoom and the toolbar's field set the one zoom, for a Viewer too.
  it('zooms from View › Zoom and the toolbar’s field alike, the level ticked', () => {
    render(<Row level="view" />);
    const field = within(screen.getByRole('toolbar')).getByRole<HTMLInputElement>('combobox', {
      name: /Zoom/,
    });
    expect(field.value).toBe('100%');
    openMenu('View');
    openSub('Zoom');
    expect(screen.getByRole('menuitemradio', { name: '100%' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: '150%' }));
    expect(field.value).toBe('150%');
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'SpreadsheetZoom');
    fireEvent.change(field, { target: { value: '110' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('110%');
    openMenu('View');
    openSub('Zoom');
    expect(screen.queryAllByRole('menuitemradio', { checked: true })).toEqual([]);
  });

  it('binds Undo and Redo to the person’s timeline for anyone who writes', () => {
    const history = { undo: vi.fn(), redo: vi.fn(), canUndo: true, canRedo: false };
    render(<Row level="participate" history={history} />);
    openMenu('Edit');
    fireEvent.click(item(/^Undo/));
    expect(history.undo).toHaveBeenCalled();
  });

  it('downloads its own standard and lists the losses of the other first', async () => {
    vi.mocked(apiDownloadWorkbook).mockResolvedValue({ blob: new Blob(['x']), fileName: 'a.ods' });
    vi.mocked(apiWorkbookConversion).mockResolvedValue({ from: 'ods', to: 'xlsx', losses: [] });
    render(<Row />);
    openMenu('File');
    openSub('Download');
    fireEvent.click(item('OpenDocument (.ods)'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Exported', 'Ods');
    openMenu('File');
    openSub('Download');
    fireEvent.click(item(/Comma-separated/));
    await waitFor(() => expect(apiDownloadWorkbook).toHaveBeenCalledWith(SCOPE, 'csv', 't1'));
    openMenu('File');
    openSub('Download');
    fireEvent.click(item('Microsoft Excel (.xlsx)'));
    await waitFor(() => expect(apiWorkbookConversion).toHaveBeenCalled());
    expect(apiDownloadWorkbook).not.toHaveBeenCalledWith(SCOPE, 'xlsx', 't1');
  });

  it('says so when a download fails', async () => {
    vi.mocked(apiDownloadWorkbook).mockRejectedValue(new Error('offline'));
    render(<Row level="view" />);
    openMenu('File');
    openSub('Download');
    fireEvent.click(item('OpenDocument (.ods)'));
    expect(await screen.findByText('The file could not be downloaded. Try again.')).toBeTruthy();
  });

  it('offers Convert to an Editor alone', async () => {
    vi.mocked(apiWorkbookConversion).mockResolvedValue({ from: 'ods', to: 'xlsx', losses: [] });
    const { unmount } = render(<Row />);
    openMenu('File');
    fireEvent.click(item('Convert to Excel (.xlsx)'));
    await waitFor(() => expect(apiWorkbookConversion).toHaveBeenCalled());
    unmount();
    render(<Row level="participate" />);
    openMenu('File');
    expect(screen.queryByRole('menuitem', { name: 'Convert to Excel (.xlsx)' })).toBeNull();
  });

  it('opens a picked file as a new spreadsheet, or says why not', async () => {
    vi.mocked(openSpreadsheetFile).mockImplementation(async (_owner, _file, progress) => {
      progress?.(0.5);
      return { ok: false, message: 'That file could not be read.' } as never;
    });
    const { container } = render(<Row />);
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['a,b'], 'Budget.csv', { type: 'text/csv' });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(await screen.findByText('That file could not be read.')).toBeTruthy();
    vi.mocked(openSpreadsheetFile).mockResolvedValue({
      ok: true,
      documentId: 'd2',
      imported: 'csv',
    } as never);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ assign } as never);
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/document/d2'));
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Imported', 'Csv');
  });
});
