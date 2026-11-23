// docs/specs/035-pdf-documents/reading-surface.md "Embedded files": Open makes a new PDF document kept where this PDF
// is, counted, and opens it; a refusal is said, a file that is no PDF in words of its own.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignAppLocation } from '@/lib/app-location';
import { track } from '@/lib/telemetry';
import { openPdfFile } from './open-pdf-file';
import { NOT_A_PDF_COPY, openEmbeddedPdf } from './open-embedded-pdf';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/app-location', () => ({ assignAppLocation: vi.fn() }));
vi.mock('./open-pdf-file', async (original) => ({
  ...(await original<typeof import('./open-pdf-file')>()),
  openPdfFile: vi.fn(),
}));

const bytes = new TextEncoder().encode('%PDF-1.7');

beforeEach(() => vi.clearAllMocks());

describe('opening an embedded PDF', () => {
  it('makes a new PDF document on LiveDoc for a PDF in its room, and opens it', async () => {
    vi.mocked(openPdfFile).mockResolvedValue({ ok: true, documentId: 'D2', held: false });
    expect(await openEmbeddedPdf('ada', 'room', { name: 'inner.pdf', bytes })).toBeNull();
    const [owner, file, folder, where] = vi.mocked(openPdfFile).mock.calls[0]!;
    expect([owner, file.name, file.size, folder, where]).toEqual([
      'ada',
      'inner.pdf',
      8,
      undefined,
      'livedoc',
    ]);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect(track).toHaveBeenCalledWith('Pdf', 'Imported', 'EmbeddedFile');
    expect(track).toHaveBeenCalledWith('Document', 'Created', 'Cloud');
    expect(assignAppLocation).toHaveBeenCalledWith('/document/D2');
  });

  it('keeps it in this browser for a PDF there, and names one that gives no name', async () => {
    vi.mocked(openPdfFile).mockResolvedValue({ ok: true, documentId: 'D3', held: false });
    await openEmbeddedPdf('ada', 'this-browser', { name: '', bytes });
    const [, file, , where] = vi.mocked(openPdfFile).mock.calls[0]!;
    expect([file.name, where]).toEqual(['Embedded file.pdf', 'browser']);
    expect(track).toHaveBeenCalledWith('Document', 'Created', 'Offline');
  });

  it('says a file that is no PDF in its own words, and any other refusal in the arrival’s', async () => {
    vi.mocked(openPdfFile).mockResolvedValue({ ok: false, refusal: 'not_a_pdf' });
    expect(await openEmbeddedPdf('ada', 'room', { name: 'fake.pdf', bytes })).toBe(NOT_A_PDF_COPY);
    vi.mocked(openPdfFile).mockResolvedValue({ ok: false, refusal: 'files_unavailable' });
    expect(await openEmbeddedPdf('ada', 'room', { name: 'a.pdf', bytes })).toBe(
      'This server has no file storage.',
    );
    expect(assignAppLocation).not.toHaveBeenCalled();
  });
});
