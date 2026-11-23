// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Embedded files"; security.md "Embedded files": listed as the PDF
// says, read out only on Save or Open, a warning line before Save for a name that runs, an embedded PDF opened as a
// new PDF document, and what is said of none, too many, too large and unreadable.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddedFile, EmbeddedFileRead, EmbeddedFiles } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { EMBEDDED_COPY, PdfEmbeddedFilesPanel } from './PdfEmbeddedFilesPanel';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const file = (over: Partial<EmbeddedFile>): EmbeddedFile => ({
  name: 'notes.txt',
  size: 5,
  type: 'text/plain',
  description: '',
  runs: false,
  ...over,
});
const FILES: EmbeddedFile[] = [
  file({ description: 'Meeting notes' }),
  file({ name: 'run.exe', size: null, type: '', runs: true }),
  file({ name: 'inner.pdf', size: 2_400_000, type: 'application/pdf' }),
  file({ name: '', size: null, type: '' }),
];
const bytes = new TextEncoder().encode('hello');

async function show(
  listed: Promise<EmbeddedFiles>,
  read: (at: number) => Promise<EmbeddedFileRead> = async () => ({ ok: true, bytes }),
  onOpenPdf = vi.fn(async () => null as string | null),
) {
  render(
    <PdfEmbeddedFilesPanel
      engine={{ embeddedFiles: () => listed, embeddedFile: read }}
      onOpenPdf={onOpenPdf}
    />,
  );
  await act(async () => {
    await listed.catch(() => {});
  });
  return onOpenPdf;
}

const row = (at: number) =>
  document.querySelector<HTMLElement>(`[data-pdf-embedded-file="${at}"]`)!;

afterEach(() => vi.clearAllMocks());

describe('the embedded files panel', () => {
  it('says it is reading until the list arrives', () => {
    render(
      <PdfEmbeddedFilesPanel
        engine={{ embeddedFiles: () => new Promise(() => {}), embeddedFile: vi.fn() }}
        onOpenPdf={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(EMBEDDED_COPY.reading);
  });

  it('lists each by its name, size, type and description, a nameless one as "Embedded file"', async () => {
    await show(Promise.resolve({ files: FILES, cut: false }));
    expect(screen.getByRole('list', { name: 'Embedded files' })).toBeTruthy();
    expect(row(0).textContent).toContain('notes.txt');
    expect(row(0).textContent).toContain('1 kB · text/plain');
    expect(row(0).textContent).toContain('Meeting notes');
    expect(row(2).textContent).toContain('2.4 MB · application/pdf');
    expect(row(3).textContent).toContain('Embedded file');
  });

  it('carries a warning line before Save on a file whose name runs, and on no other', async () => {
    await show(Promise.resolve({ files: FILES, cut: false }));
    expect(row(1).textContent).toContain(EMBEDDED_COPY.runs);
    expect(row(0).textContent).not.toContain(EMBEDDED_COPY.runs);
  });

  it('reads a file out only on Save, and downloads it under its name', async () => {
    const read = vi.fn(async () => ({ ok: true as const, bytes }));
    await show(Promise.resolve({ files: FILES, cut: false }), read);
    expect(read).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save notes.txt' }));
    });
    expect(read).toHaveBeenCalledWith(0);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect([name, blob.type, blob.size]).toEqual(['notes.txt', 'text/plain', 5]);
    expect(track).toHaveBeenCalledWith('Pdf', 'Exported', 'EmbeddedFile');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Embedded file' }));
    });
    expect(vi.mocked(downloadBlob).mock.calls[1]!.slice(1)).toEqual(['Embedded file']);
    expect(vi.mocked(downloadBlob).mock.calls[1]![0].type).toBe('application/octet-stream');
  });

  it('offers Open on an embedded PDF alone, and opens it as a new PDF document', async () => {
    const onOpenPdf = await show(Promise.resolve({ files: FILES, cut: false }));
    expect(screen.queryByRole('button', { name: 'Open notes.txt' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open inner.pdf' }));
    });
    expect(onOpenPdf).toHaveBeenCalledWith({ name: 'inner.pdf', bytes });
  });

  it('says on the row why a file could not be opened', async () => {
    await show(
      Promise.resolve({ files: FILES, cut: false }),
      undefined,
      vi.fn(async () => 'This file isn’t a PDF.'),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open inner.pdf' }));
    });
    expect(row(2).textContent).toContain('This file isn’t a PDF.');
  });

  it('says a file too large or unreadable on its row, and downloads nothing', async () => {
    const read = vi.fn(async (at: number): Promise<EmbeddedFileRead> => ({
      ok: false,
      refusal: at === 0 ? 'too_large' : 'unreadable',
    }));
    await show(Promise.resolve({ files: FILES, cut: false }), read);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save notes.txt' }));
    });
    expect(row(0).textContent).toContain(EMBEDDED_COPY.tooLarge);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save run.exe' }));
    });
    expect(row(1).textContent).toContain(EMBEDDED_COPY.unreadable);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('says a PDF has none, and when it holds more than are listed', async () => {
    await show(Promise.resolve({ files: [], cut: false }));
    expect(screen.getByText(EMBEDDED_COPY.none)).toBeTruthy();
  });

  it('says when the PDF holds more than are listed', async () => {
    await show(Promise.resolve({ files: FILES, cut: true }));
    expect(screen.getByText(EMBEDDED_COPY.cut)).toBeTruthy();
  });

  it('says and logs a list that cannot be read', async () => {
    await show(Promise.reject(new Error('stopped')));
    expect(screen.getByRole('alert').textContent).toBe(EMBEDDED_COPY.failed);
    expect(debugLog).toHaveBeenCalledWith('[pdf] embedded-list-failed', 'Error: stopped');
  });
});
