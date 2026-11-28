// docs/specs/034-text-documents/files-and-print.md "A PDF imported": read in this browser, created as a state with its
// import report, the engine always ended; refusals in the PDF document's words.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageText } from '@livedoc/pdf-documents';
import { bytesOfBase64, TextDocumentState } from '@livedoc/text-documents';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { keepImportReport } from '@/lib/office/import-report-handoff';
import { track } from '@/lib/telemetry';
import {
  importPdfFile,
  PDF_PASSWORD_REFUSAL,
  PDF_TOO_HEAVY,
  PDF_TOO_LONG,
  type PdfImportEngine,
} from './import-pdf-file';

vi.mock('@/lib/api-client', async (real) => ({
  ...(await real<typeof import('@/lib/api-client')>()),
  apiCreateDocument: vi.fn(),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/office/import-report-handoff', () => ({ keepImportReport: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const text = (words: string) =>
  PageText.of(
    [...words].map((c) => c.codePointAt(0)!),
    [...words].flatMap((_, at) => [72 + at * 6, 690, 78 + at * 6, 700]),
  );

function engine(opened: unknown, pageText = text('Hello PDF')) {
  const terminate = vi.fn();
  const fake = {
    open: vi.fn(() => Promise.resolve(opened)),
    pageText: () => Promise.resolve(pageText),
    pageTags: () => Promise.resolve(null),
    pagePictures: () => Promise.resolve(null),
    terminate,
  } as unknown as PdfImportEngine;
  return { fake, terminate };
}

const OPENED = { ok: true, pages: [{}], document: {} };
const pdf = new File(['%PDF-1.7'], 'Brief.pdf');

describe('importPdfFile', () => {
  it('creates an OpenDocument text document holding the pages and their report', async () => {
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    const { fake, terminate } = engine(OPENED);
    const opened = await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(fake));
    expect(opened.ok).toBe(true);
    const body = vi.mocked(apiCreateDocument).mock.calls[0]![1] as {
      name: string;
      tabs: { format: string }[];
      textDocuments: { state: string }[];
    };
    expect(body.name).toBe('Brief');
    expect(body.tabs[0]!.format).toBe('odf');
    const doc = TextDocumentState.load([bytesOfBase64(body.textDocuments[0]!.state)!]);
    expect(TextDocumentState.paragraphs(doc).map((p) => p.text)).toEqual(['Hello PDF']);
    // Nothing was left out: no report.
    expect(TextDocumentState.report(doc).imported).toBeNull();
    expect(track).toHaveBeenCalledWith('Tab', 'Imported', 'Pdf');
    expect(keepImportReport).toHaveBeenCalledWith(expect.any(String), { name: 'Brief', lines: [] });
    expect(terminate).toHaveBeenCalled();
  });

  it('refuses a password-protected PDF and one the engine refuses, in their words', async () => {
    const locked = engine({ ok: false, needsPassword: true });
    expect(await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(locked.fake))).toEqual({
      ok: false,
      message: PDF_PASSWORD_REFUSAL,
    });
    expect(locked.terminate).toHaveBeenCalled();
    const damaged = engine({ ok: false, refusal: 'pdf_damaged' });
    expect(await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(damaged.fake))).toEqual({
      ok: false,
      message: "This PDF is damaged and can't be opened.",
    });
    expect(apiCreateDocument).not.toHaveBeenCalled();
  });

  it('refuses a PDF past the character limit', async () => {
    const long = engine(OPENED, text('x'.repeat(1_020_001)));
    expect(await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(long.fake))).toEqual({
      ok: false,
      message: PDF_TOO_LONG,
    });
  });

  it('says it could not open the file when anything throws, the engine ended all the same', async () => {
    vi.mocked(apiCreateDocument).mockRejectedValue(new Error('offline'));
    const { fake, terminate } = engine(OPENED);
    expect(await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(fake))).toEqual({
      ok: false,
      message: 'The file could not be opened. Try again.',
    });
    expect(terminate).toHaveBeenCalled();
    expect(
      await importPdfFile('me', pdf, 'Brief', () => Promise.reject(new Error('no worker'))),
    ).toMatchObject({ ok: false });
  });

  it('refuses a PDF whose pictures pass the create’s limit', async () => {
    vi.mocked(apiCreateDocument).mockRejectedValue(
      new ApiError('create document', 413, 'payload_too_large'),
    );
    const { fake } = engine(OPENED);
    expect(await importPdfFile('me', pdf, 'Brief', () => Promise.resolve(fake))).toEqual({
      ok: false,
      message: PDF_TOO_HEAVY,
    });
  });
});
