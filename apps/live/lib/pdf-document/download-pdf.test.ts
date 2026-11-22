// docs/specs/035-pdf-documents/saving.md "An unchanged file", "The validators' claim"; files-print-and-sync.md
// "Downloading".
import { describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import { readerWasm, textPdf } from '@livedoc/pdf-documents/testing';
import { bakeForDownload } from './download-pdf';
import { addHighlight } from './pdf-highlight';

const QUAD: Quad = [72, 730, 300, 730, 72, 716, 300, 716];
const stored = { blob: 'ab'.repeat(32) as BlobKey, pages: 2 };

describe('bakeForDownload', () => {
  // "Empty live changes are never baked": the stored file itself, and no engine touches it.
  it('hands out the stored file itself when nobody changed the PDF', async () => {
    const bytes = await textPdf(2);
    const engine = { bake: vi.fn() };
    for (const doc of [PdfLiveChanges.load(), null]) {
      const download = await bakeForDownload({
        engine,
        doc,
        documentName: 'Lease: 2026',
        readStored: async () => bytes,
      });
      expect(download).toEqual({ ok: true, kind: 'unchanged', bytes, fileName: 'Lease 2026.pdf' });
    }
    expect(engine.bake).not.toHaveBeenCalled();
  });

  it('bakes every live change into the file, the stored file its prefix', async () => {
    const bytes = await textPdf(2);
    const engine = await createPdfEngine({ wasm: readerWasm() });
    const opened = await engine.open(bytes.slice());
    if (!opened.ok) throw new Error('fixture');
    const doc = PdfLiveChanges.load();
    addHighlight(
      doc,
      { page: opened.pages[0]!.name, stored },
      { text: 'The quick', quads: [QUAD] },
      { author: 'Ada', now: 1_795_000_000_000, id: 'm1' },
    );
    const readStored = vi.fn();
    const download = await bakeForDownload({ engine, doc, documentName: '', readStored });
    if (!download.ok) throw new Error(download.refusal);
    expect(download.kind).toBe('addition');
    expect(download.fileName).toBe('Untitled PDF.pdf');
    expect(download.bytes.byteLength).toBeGreaterThan(bytes.byteLength);
    expect(download.bytes.slice(0, bytes.byteLength)).toEqual(bytes);
    expect(readStored).not.toHaveBeenCalled();
    await engine.open(download.bytes);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['m1']);
  });

  // saving.md "Addition or rewrite": what an addition could not place is counted, never dropped silently.
  it('says how many marks and field values the file could not take', async () => {
    const said = vi.spyOn(console, 'info').mockImplementation(() => {});
    const doc = PdfLiveChanges.load();
    addHighlight(
      doc,
      { page: PageName.ofObject(4), stored },
      { text: 'x', quads: [QUAD] },
      { author: 'Ada', now: 1, id: 'm1' },
    );
    const bytes = new Uint8Array(9);
    const download = await bakeForDownload({
      engine: {
        bake: async () => ({ ok: true, bytes, kind: 'rewrite', anchorsLost: 2, fieldsLost: 3 }),
      },
      doc,
      documentName: 'Lease',
      readStored: vi.fn(),
    });
    expect(download).toEqual({ ok: true, kind: 'rewrite', bytes, fileName: 'Lease.pdf' });
    const lines = said.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain('[pdf] anchors-lost count=2');
    expect(lines).toContain('[pdf] fields-lost count=3');
    said.mockRestore();
  });

  // "A bake that fails the check is not handed out."
  it('answers a bake that was refused, handing out nothing', async () => {
    const doc = PdfLiveChanges.load();
    addHighlight(
      doc,
      { page: PageName.ofObject(4), stored },
      { text: 'x', quads: [QUAD] },
      { author: 'Ada', now: 1, id: 'm1' },
    );
    const download = await bakeForDownload({
      engine: { bake: async () => ({ ok: false, refusal: 'reopen' }) },
      doc,
      documentName: 'Lease',
      readStored: vi.fn(),
    });
    expect(download).toEqual({ ok: false, refusal: 'reopen' });
  });
});
