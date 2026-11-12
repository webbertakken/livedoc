// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { DomainModelExportPanel } from './DomainModelExportPanel';

// The Export dialog's Domain Model panel (docs/specs/021-event-storming/domain-export.md "The zip").

const caps = { aiEnabled: true, emailEnabled: false };
vi.mock('@/hooks/persistence/useCapabilities', () => ({ useCapabilities: () => caps }));

type Lib = typeof import('@/lib/domain-export');
const request = vi.fn<Lib['requestDomainExport']>();
const readEarlier = vi.fn<Lib['readEarlierExport']>();
vi.mock('@/lib/domain-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/domain-export')>()),
  requestDomainExport: (...a: Parameters<Lib['requestDomainExport']>) => request(...a),
  readEarlierExport: (...a: Parameters<Lib['readEarlierExport']>) => readEarlier(...a),
}));
const download = vi.fn<(blob: Blob, name: string) => void>();
vi.mock('@/lib/export-tab', () => ({
  downloadBlob: (blob: Blob, name: string) => download(blob, name),
}));
const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));

const tab = { id: 't1', name: 'Orders', elements: [], kind: 'event-storming' } as unknown as Tab;
const context = { ownerId: 'me', documentId: 'd', shareCode: null };

function draw() {
  const onDone = vi.fn();
  const onBack = vi.fn();
  render(
    <DomainModelExportPanel
      tab={tab}
      documentName="Shop"
      context={context}
      onDone={onDone}
      onBack={onBack}
    />,
  );
  return { onDone, onBack };
}

beforeEach(() => {
  localStorage.clear();
  caps.aiEnabled = true;
  request.mockReset();
  readEarlier.mockReset();
  download.mockReset();
  track.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const exportButton = () => screen.getByRole('button', { name: 'Export .zip' });

describe('DomainModelExportPanel', () => {
  it('says what the zip holds before the export, with and without a model', () => {
    draw();
    expect(screen.getByText(/written from this board by the model/)).toBeTruthy();
    cleanup();
    caps.aiEnabled = false;
    draw();
    expect(screen.getByText(/This deployment has no model/)).toBeTruthy();
  });

  it('exports in the chosen language, remembers it, downloads the zip and counts it', async () => {
    request.mockResolvedValue({ ok: true, files: { 'README.md': 'hi' }, written: true });
    const { onDone } = draw();
    const picker = screen.getByRole('combobox', { name: 'Types in' });
    expect((picker as HTMLSelectElement).value).toBe('typescript');
    fireEvent.change(picker, { target: { value: 'go' } });
    await act(async () => fireEvent.click(exportButton()));
    expect(request.mock.calls[0]![0]).toMatchObject({
      documentId: 'd',
      tabId: 't1',
      language: 'go',
      previous: null,
      bundleOnly: false,
    });
    expect(download.mock.calls[0]![1]).toBe('Shop - Orders - Domain Model.zip');
    expect(track).toHaveBeenCalledWith('Document', 'Exported', 'DomainModel');
    expect(onDone).toHaveBeenCalled();
    expect(localStorage.getItem('livedoc:v2:storm-export-language:t1')).toBe('go');
  });

  it('updates an earlier export it was given', async () => {
    readEarlier.mockResolvedValue({ ok: true, files: { 'livedoc/storm.json': '{}' } });
    request.mockResolvedValue({ ok: true, files: {}, written: false });
    draw();
    const file = new File(['zip'], 'earlier.zip', { type: 'application/zip' });
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Update an earlier export (optional)'), {
        target: { files: [file] },
      }),
    );
    expect(screen.getByText(/in earlier.zip to match the board/)).toBeTruthy();
    await act(async () => fireEvent.click(exportButton()));
    expect(request.mock.calls[0]![0].previous).toEqual({ 'livedoc/storm.json': '{}' });
    expect(track).toHaveBeenCalledWith('Document', 'Exported', 'DomainModelBundle');
  });

  it('says why an earlier zip cannot be read, and forgets it', async () => {
    readEarlier.mockResolvedValue({ ok: false, error: 'previous_unreadable' });
    draw();
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Update an earlier export (optional)'), {
        target: { files: [new File(['x'], 'x.zip')] },
      }),
    );
    expect(screen.getByRole('alert').textContent).toContain('not a zip this export can read');
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Update an earlier export (optional)'), {
        target: { files: [] },
      }),
    );
    expect(screen.getByText(/starts a new spec/)).toBeTruthy();
  });

  it('offers the board reading alone when the model fails', async () => {
    request.mockResolvedValueOnce({ ok: false, error: 'ai_failed' });
    request.mockResolvedValueOnce({ ok: true, files: {}, written: false });
    draw();
    await act(async () => fireEvent.click(exportButton()));
    expect(screen.getByRole('alert').textContent).toContain('could not write');
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Download the Board Reading Only' })),
    );
    expect(request.mock.calls[1]![0].bundleOnly).toBe(true);
    expect(download).toHaveBeenCalled();
  });

  it('names an unknown refusal plainly, and a failed request too', async () => {
    request.mockResolvedValueOnce({ ok: false, error: 'something_new' });
    draw();
    await act(async () => fireEvent.click(exportButton()));
    expect(screen.getByRole('alert').textContent).toBe('The export failed. Try again.');
    request.mockRejectedValueOnce(new Error('network'));
    await act(async () => fireEvent.click(exportButton()));
    expect(screen.getByRole('alert').textContent).toBe('The export failed. Try again.');
  });

  it('shows progress, and Cancel stops the export quietly', async () => {
    let signal: AbortSignal | undefined;
    request.mockImplementation(
      (input) =>
        new Promise((_, reject) => {
          signal = input.signal;
          input.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    draw();
    await act(async () => fireEvent.click(exportButton()));
    expect(screen.getByRole('status').textContent).toContain('this can take a minute');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('goes back to the formats', () => {
    const { onBack } = draw();
    fireEvent.click(screen.getByRole('button', { name: /All formats/ }));
    expect(onBack).toHaveBeenCalled();
  });
});
