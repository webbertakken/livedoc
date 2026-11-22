// docs/specs/035-pdf-documents/security.md "The boundary": the engine starts from the reader's binary alone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerWasm, textPdf } from '../testing/fixtures';
import { startPdfEngine } from './browser';

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
});
