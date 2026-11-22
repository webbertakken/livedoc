import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { LaidOutPage, Tab } from '@livedoc/document';
import { PDF_MAX_PAGE_POINTS, type PdfEngine } from '@livedoc/pdf-documents';
import { createPdfEngine } from '@livedoc/pdf-documents/engine';
import { readerWasm } from '@livedoc/pdf-documents/testing';

// A canvas as the renderer hands one over: `pixels` are RGBA, the render's scale beside it.
type Rendered = { width: number; height: number; pixels: number[]; scale: number };
let rendered: Rendered[] = [];

vi.mock('./export-tab', () => ({
  renderTabToCanvas: vi.fn(async () => {
    const next = rendered.shift();
    if (!next) throw new Error('nothing left to render');
    return {
      width: next.width,
      height: next.height,
      scale: next.scale,
      getContext: () => ({ getImageData: () => ({ data: Uint8ClampedArray.from(next.pixels) }) }),
    };
  }),
  renderedExportScale: (canvas: { scale: number }) => canvas.scale,
}));

const { exportPagesAsPdf, exportTabAsPdf, singlePageMedia } = await import('./export-tab-pdf');

const TAB = {} as Tab;
const page = (width: number, height: number) => ({ rect: { width, height } }) as LaidOutPage;
const filled = (width: number, height: number, rgba: readonly number[]) =>
  Array.from({ length: width * height }, () => rgba).flat();

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
});

async function opened(blob: Blob) {
  expect(blob.type).toBe('application/pdf');
  const result = await engine.open(new Uint8Array(await blob.arrayBuffer()));
  if (!result.ok) throw new Error('the exported PDF did not open');
  return result;
}

// A single-page PDF prints at the size the tab shows (0.75 pt per CSS px), not
// at the 2x render's pixel count, and never past the PDF page limit.
describe('singlePageMedia', () => {
  it('sizes the page from CSS px, not device pixels', () => {
    // An 1000 x 500 CSS px tab rendered at 2x.
    expect(singlePageMedia(2000, 1000, 2)).toEqual({ mediaW: 750, mediaH: 375 });
  });

  it('gives the same page whatever scale the render took', () => {
    expect(singlePageMedia(1000, 500, 1)).toEqual(singlePageMedia(2000, 1000, 2));
  });

  it('shrinks a page past the PDF limit uniformly to fit it', () => {
    // 32768 x 16384 CSS px, rendered at 0.5 to stay under the canvas cap.
    const { mediaW, mediaH } = singlePageMedia(16384, 8192, 0.5);
    expect(mediaW).toBe(PDF_MAX_PAGE_POINTS);
    expect(mediaH).toBe(PDF_MAX_PAGE_POINTS / 2);
  });

  it('keeps a tall page inside the limit on its long side', () => {
    const { mediaW, mediaH } = singlePageMedia(4000, 40000, 1);
    expect(mediaH).toBe(PDF_MAX_PAGE_POINTS);
    expect(mediaW).toBe(1440);
  });
});

// files-print-and-sync.md "One writer": a canvas tab's Download as PDF is written by the repository's one writer.
describe('a tab exported as a PDF', () => {
  it('is one page at the size the tab shows, its picture across it, see-through pixels on white', async () => {
    // 4 x 2 device pixels at 2x: 2 x 1 CSS px, so 1.5 x 0.75 pt; red, half see-through.
    rendered = [{ width: 4, height: 2, scale: 2, pixels: filled(4, 2, [255, 0, 0, 128]) }];
    const pdf = await opened(await exportTabAsPdf(TAB));
    expect(pdf.pages.map((p) => [p.width, p.height])).toEqual([[1.5, 1]]);
    expect(pdf.document.properties.producer).toBe('LiveDoc');
    const drawn = (await engine.drawPage(0, 4))!;
    expect([...drawn.rgba.slice(0, 4)]).toEqual([255, 127, 127, 255]);
  });

  it('is a PDF any reader opens: its file ends as a PDF does', async () => {
    rendered = [{ width: 1, height: 1, scale: 1, pixels: [0, 0, 0, 255] }];
    const text = new TextDecoder('latin1').decode(await (await exportTabAsPdf(TAB)).arrayBuffer());
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});

// pages-mode.md "Export": every page in row order, one PDF page each at its own size in print points.
describe('a Pages tab exported as a PDF', () => {
  it('is a page a sheet, each its own size and orientation, in order', async () => {
    rendered = [
      { width: 2, height: 2, scale: 1, pixels: filled(2, 2, [0, 128, 0, 255]) },
      { width: 2, height: 1, scale: 1, pixels: filled(2, 1, [0, 0, 255, 255]) },
    ];
    const pdf = await opened(await exportPagesAsPdf(TAB, [page(794, 1123), page(1123, 794)]));
    expect(pdf.pages.map((p) => [p.width, p.height])).toEqual([
      [595.5, 842.25],
      [842.25, 595.5],
    ]);
    expect([...(await engine.drawPage(0, 0.05))!.rgba.slice(0, 4)]).toEqual([0, 128, 0, 255]);
    expect([...(await engine.drawPage(1, 0.05))!.rgba.slice(0, 4)]).toEqual([0, 0, 255, 255]);
  });

  it('says so in the dialog’s words where there is no page, or a page no PDF can hold', async () => {
    await expect(exportPagesAsPdf(TAB, [])).rejects.toThrow('There is no page to export.');
    rendered = [{ width: 1, height: 1, scale: 1, pixels: [0, 0, 0, 255] }];
    await expect(exportPagesAsPdf(TAB, [page(30_000, 100)])).rejects.toThrow(
      'A page is larger than a PDF page can be.',
    );
  });

  it('fails by name where the canvas has no pixels to give', async () => {
    const { renderTabToCanvas } = await import('./export-tab');
    vi.mocked(renderTabToCanvas).mockResolvedValueOnce({
      width: 1,
      height: 1,
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    await expect(exportTabAsPdf(TAB)).rejects.toThrow('no 2d context');
  });
});
