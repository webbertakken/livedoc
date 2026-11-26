// docs/specs/035-pdf-documents/saving.md "An unchanged file", "The validators' claim"; files-print-and-sync.md
// "Downloading".
import { describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import { readerWasm, textPdf } from '@livedoc/pdf-documents/testing';
import { bakeForDownload, bakePictures, bakeProblemOf, PICTURES_FAILED_COPY } from './download-pdf';
import { addCustomStamp } from './pdf-stamp';
import { addTextMark } from './pdf-text-mark';

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
    addTextMark(
      doc,
      'highlight',
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
    addTextMark(
      doc,
      'highlight',
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
    addTextMark(
      doc,
      'highlight',
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

// custom-stamps.md "Placing one": a bake is handed each picture its marks name; one not read is left out, so the bake
// refuses `pictures-unavailable` by name, said in "Errors"' words.
describe('a custom stamp’s picture in a bake', () => {
  const picture = { key: 'cd'.repeat(32) as BlobKey, type: 'png' as const, width: 8, height: 4 };
  const withStamp = () => {
    const doc = PdfLiveChanges.load();
    addCustomStamp(
      doc,
      { page: PageName.ofObject(1), stored, box: [0, 0, 612, 792] },
      {
        id: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
        name: 'Paid',
        category: 'C',
        picture,
        natural: { width: 6, height: 3 },
        createdAt: 1,
        updatedAt: 1,
      },
      { x: 100, y: 100 },
      { author: 'Ada', now: 1, id: 'c1' },
    );
    return doc;
  };

  it('hands the bake each picture its marks name, read by its key', async () => {
    const bytes = new Uint8Array([0x89, 0x50]);
    const read = vi.fn(async () => bytes);
    expect(await bakePictures(withStamp(), read)).toEqual(new Map([[picture.key, bytes]]));
    expect(read).toHaveBeenCalledWith(picture.key);
    expect(await bakePictures(PdfLiveChanges.load(), read)).toEqual(new Map());
    expect(read).toHaveBeenCalledOnce();
  });

  it('leaves out a picture not read, and says the refusal in its words', async () => {
    const read = vi.fn(async () => {
      throw new Error('blob_missing');
    });
    const engine = {
      bake: vi.fn(async () => ({ ok: false as const, refusal: 'pictures-unavailable' as const })),
    };
    const download = await bakeForDownload({
      engine,
      doc: withStamp(),
      documentName: 'Lease',
      readStored: async () => new Uint8Array(),
      readPicture: read,
    });
    expect(engine.bake).toHaveBeenCalledWith(expect.any(Uint8Array), new Map());
    expect(download).toEqual({ ok: false, refusal: 'pictures-unavailable' });
    expect(bakeProblemOf('pictures-unavailable')).toBe(PICTURES_FAILED_COPY);
  });
});
