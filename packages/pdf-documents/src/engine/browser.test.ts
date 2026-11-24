// docs/specs/035-pdf-documents/security.md "The boundary": the engine starts from the reader's binary alone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markFaceFiles, readerWasm, textPdf } from '../testing/fixtures';
import { fetchMarkFace, startPdfEngine } from './browser';

afterEach(() => vi.unstubAllGlobals());

describe('the engine in a browser', () => {
  it('fetches the reader’s binary once, then opens a PDF', async () => {
    const fetched = vi.fn(async (_url: URL) => new Response(readerWasm().slice()));
    vi.stubGlobal('fetch', fetched);
    const engine = await startPdfEngine();
    const opened = await engine.open(await textPdf(2));
    expect(opened.ok && opened.pages.length).toBe(2);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(String(fetched.mock.calls[0]![0])).toMatch(/pdfium\.wasm$/);
    await engine.close();
  });

  it('says so when the binary does not load', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }));
    await expect(startPdfEngine()).rejects.toThrow('404');
  });

  // marks.md "Loading": a mark face is the app's own asset, fetched from its own origin.
  it('fetches a mark face as an asset of the app, and says so when it does not load', async () => {
    const file = 'noto-sans/files/noto-sans-greek-400-normal.woff';
    const fetched = vi.fn(async (_url: URL) => new Response((await markFaceFiles(file)).slice()));
    vi.stubGlobal('fetch', fetched);
    expect((await fetchMarkFace(file)).byteLength).toBe((await markFaceFiles(file)).byteLength);
    expect(String(fetched.mock.calls[0]![0])).toMatch(/noto-sans-greek-400-normal\.woff$/);
    await expect(fetchMarkFace('no-such-face.woff')).rejects.toThrow('no such face');
    // A region's slice, found in its region's table of slices.
    const slice = 'noto-sans-kr/files/noto-sans-kr-79-400-normal.woff';
    await fetchMarkFace(slice);
    expect(String(fetched.mock.calls.at(-1)![0])).toMatch(/noto-sans-kr-79-400-normal\.woff$/);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
    await expect(fetchMarkFace(file)).rejects.toThrow('503');
  });
});
