import { describe, expect, it, vi } from 'vitest';
import { PDF_PRINT_DPI } from '@livedoc/pdf-documents';
import { pdfPagesAsPictures } from './print-pictures';

// docs/specs/034-text-documents/files-and-print.md "Printing": where the browser cannot print a PDF, the written PDF's
// pages go to it as pictures, each at its page's size.

const BYTES = Uint8Array.of(37, 80, 68, 70);
const page = (width: number, height: number) => ({ width, height });
const drawn = {
  width: 2,
  height: 1,
  rgba: new Uint8ClampedArray(8),
  toView: [1, 0, 0, 1, 0, 0] as const,
};

function engine(over: Record<string, unknown> = {}) {
  return {
    open: vi.fn(async () => ({ ok: true, pages: [page(612, 792), page(792, 612)] })),
    drawPage: vi.fn(async () => drawn),
    close: vi.fn(async () => {}),
    ...over,
  };
}

describe('pdfPagesAsPictures', () => {
  it('draws each page at the print resolution, a JPEG at its page’s size, and closes the engine', async () => {
    const reader = engine();
    const toJpeg = vi.fn(async () => Uint8Array.of(0xff, 0xd8));
    // @ts-expect-error a fake engine of the three calls used
    const pictures = await pdfPagesAsPictures(BYTES, reader, toJpeg);
    expect(pictures).toEqual([
      { jpeg: Uint8Array.of(0xff, 0xd8), width: 612, height: 792 },
      { jpeg: Uint8Array.of(0xff, 0xd8), width: 792, height: 612 },
    ]);
    expect(reader.drawPage).toHaveBeenCalledWith(0, PDF_PRINT_DPI / 72);
    expect(toJpeg).toHaveBeenCalledWith(2, 1, drawn.rgba, 0.92);
    expect(reader.close).toHaveBeenCalled();
  });

  it('answers none where the PDF does not open or a page does not draw', async () => {
    const toJpeg = vi.fn(async () => Uint8Array.of(1));
    const shut = engine({ open: vi.fn(async () => ({ ok: false })) });
    // @ts-expect-error a fake engine of the three calls used
    expect(await pdfPagesAsPictures(BYTES, shut, toJpeg)).toBeNull();
    expect(shut.close).toHaveBeenCalled();
    const blank = engine({ drawPage: vi.fn(async () => null) });
    // @ts-expect-error a fake engine of the three calls used
    expect(await pdfPagesAsPictures(BYTES, blank, toJpeg)).toBeNull();
  });
});
