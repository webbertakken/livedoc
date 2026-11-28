// @vitest-environment jsdom
// docs/specs/034-text-documents/files-and-print.md "Downloading": Download as PDF writes the pages in their printing
// look; File > Keep a PDF copy in LiveDoc stores the same PDF as a PDF document naming its source.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import {
  DOWNLOAD_PDF_ITEM,
  KEEP_PDF_COPY_ITEM,
  KEEP_PDF_FAILED_COPY,
  PDF_FAILED_COPY,
  keptCopy,
  useTextDocumentPdf,
  type PrintingLook,
} from './useTextDocumentPdf';
import type { openPdfFile } from '@/lib/pdf-document/open-pdf-file';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/text-document/print/capture-pages', () => ({
  browserMeasure: () => ({}),
  capturePages: vi.fn(() => ({
    pages: [{ width: 1, height: 1, items: [], sources: [] }],
    faces: [],
    pictures: [],
  })),
}));
vi.mock('@/lib/text-document/print/capture-pictures', () => ({
  drawPictures: vi.fn(async () => 0),
}));
vi.mock('@/lib/text-document/print/print-tags', () => ({
  printStructure: vi.fn(() => ({ tags: [], outline: [] })),
}));
const written = vi.hoisted(() => ({
  result: {
    ok: true,
    bytes: Uint8Array.of(37, 80, 68, 70),
    missing: 0,
    facesFailed: 0,
    droppedLinks: 0,
  } as unknown,
  documents: [] as unknown[],
}));
vi.mock('@livedoc/pdf-documents/laid-out', () => ({
  fetchMarkFace: vi.fn(),
  writeLaidOutPages: vi.fn(async (document: unknown) => {
    written.documents.push(document);
    return written.result;
  }),
}));

// The page as laid out: one sheet, the pages settled at once.
beforeEach(() => {
  written.result = {
    ok: true,
    bytes: Uint8Array.of(37, 80, 68, 70),
    missing: 0,
    facesFailed: 0,
    droppedLinks: 0,
  };
  written.documents.length = 0;
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 0));
  vi.mocked(track).mockClear();
});

function setUp(
  keep: typeof openPdfFile = vi.fn(async () => ({
    ok: true as const,
    documentId: 'copy-1',
    held: true,
  })),
) {
  const page = document.createElement('div');
  page.dataset.laidOut = 'pages';
  page.innerHTML = '<div data-page-sheet="1"></div>';
  document.body.replaceChildren(page);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ schema: textDocumentSchema }),
  });
  const setPrinting = vi.fn<(look: PrintingLook) => void>();
  const openTab = vi.fn();
  const hook = renderHook(() =>
    useTextDocumentPdf({
      view,
      root: () => page,
      pages: [{ width: 794, height: 1123 }],
      readStyles: () => [],
      name: 'Plan',
      printing: null,
      setPrinting,
      place: { ownerId: 'owner-1', documentId: 'doc-1', local: false },
      keep,
      openTab,
    }),
  );
  const shown = render(<>{hook.result.current.dialog}</>);
  const rerender = () => shown.rerender(<>{hook.result.current.dialog}</>);
  return { hook, setPrinting, keep, openTab, rerender };
}

/** Runs an action and lets its steps play out: it is fire-and-forget, as a menu item's is. */
async function run(action: () => void) {
  await act(async () => {
    action();
    for (let tick = 0; tick < 40; tick += 1) await new Promise((done) => setTimeout(done, 0));
  });
}

describe('useTextDocumentPdf', () => {
  it('downloads the pages as a PDF named after the document, in the printing look and out of it again', async () => {
    const { hook, setPrinting } = setUp();
    await run(hook.result.current.actions[DOWNLOAD_PDF_ITEM]!.run);
    expect(setPrinting.mock.calls.map(([look]) => look)).toEqual(['capture', null, null]);
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Plan.pdf');
    expect(track).toHaveBeenCalledWith('Document', 'Exported', 'TextDocumentPdf');
    expect(written.documents[0]).toMatchObject({
      title: 'Plan',
      pages: [{ width: 1, height: 1, items: [] }],
    });
    expect(written.documents[0]).not.toHaveProperty('subject');
  });

  it('says a PDF that could not be made', async () => {
    written.result = { ok: false, refusal: 'no_pages' };
    const { hook, rerender } = setUp();
    await run(hook.result.current.actions[DOWNLOAD_PDF_ITEM]!.run);
    rerender();
    expect(screen.getByRole('status').textContent).toBe(PDF_FAILED_COPY);
  });

  it('keeps a PDF copy beside its source, naming it in the Subject, and opens it', async () => {
    const { hook, keep, openTab, rerender } = setUp();
    await run(hook.result.current.actions[KEEP_PDF_COPY_ITEM]!.run);
    expect(written.documents[0]).toMatchObject({
      subject: `Made from Plan (${window.location.origin}/document/doc-1)`,
    });
    expect(keep).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ name: 'Plan.pdf', size: 4 }),
      undefined,
      'livedoc',
    );
    expect(track).toHaveBeenCalledWith('Document', 'Exported', 'TextDocumentPdfCopy');
    rerender();
    expect(screen.getByRole('status').textContent).toBe(keptCopy('Plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(openTab).toHaveBeenCalledWith('copy-1');
  });

  it('says a PDF copy that could not be kept', async () => {
    const { hook, rerender } = setUp(
      vi.fn(async () => ({ ok: false as const, refusal: 'files_unavailable' as const })),
    );
    await run(hook.result.current.actions[KEEP_PDF_COPY_ITEM]!.run);
    rerender();
    expect(screen.getByRole('status').textContent).toBe(KEEP_PDF_FAILED_COPY);
    expect(track).not.toHaveBeenCalledWith('Document', 'Exported', 'TextDocumentPdfCopy');
  });
});
