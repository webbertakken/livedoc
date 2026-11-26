// docs/specs/035-pdf-documents/custom-stamps.md "Making one": the picture as kept.
import { describe, expect, it, vi } from 'vitest';
import {
  PDF_CUSTOM_STAMP_MAX_SIDE_PX,
  PDF_CUSTOM_STAMP_PAGE_SCALE,
  PDF_STAMP_MAX_BYTES,
} from '@livedoc/pdf-documents';
import {
  heldSize,
  keepPicture,
  sniffPicture,
  stampNameOf,
  type PictureDrawing,
} from './custom-stamp-picture';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytesOf = (head: number[] | string, size = 64): Uint8Array<ArrayBuffer> => {
  const start = typeof head === 'string' ? [...new TextEncoder().encode(head)] : head;
  const bytes = new Uint8Array(Math.max(size, start.length));
  bytes.set(start);
  return bytes;
};

/** A browser that reads a picture of `size`, and encodes a drawing in `bytesAt(width)` bytes. */
function drawingOf(
  size: { width: number; height: number } | null,
  bytesAt: (width: number) => number = () => 100,
): PictureDrawing<string> & { encode: ReturnType<typeof vi.fn> } {
  return {
    read: vi.fn(async () => (size ? { ...size, held: 'picture' } : null)),
    encode: vi.fn(async (_held, at: { width: number }, type: string) =>
      bytesOf(type === 'png' ? PNG : [0xff, 0xd8, 0xff], bytesAt(at.width)),
    ),
    page: vi.fn(async (_bytes, _index, scale: number) => ({
      width: 612 * scale,
      height: 792 * scale,
      points: { width: 612, height: 792 },
      pages: 3,
      held: 'page',
    })),
  };
}

describe('sniffPicture', () => {
  it('knows a file by its bytes, never its name', () => {
    expect(sniffPicture(bytesOf(PNG))).toBe('png');
    expect(sniffPicture(bytesOf([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffPicture(bytesOf('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffPicture(bytesOf('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(sniffPicture(bytesOf('<?xml version="1.0"?>\n<!-- made --><svg>'))).toBe('svg');
    expect(sniffPicture(bytesOf('<html><svg>'))).toBeNull();
    expect(sniffPicture(bytesOf('GIF89a'))).toBeNull();
  });
});

describe('heldSize', () => {
  it('holds the longer side to the most, its shape kept', () => {
    expect(heldSize({ width: 2400, height: 600 })).toEqual({
      width: PDF_CUSTOM_STAMP_MAX_SIDE_PX,
      height: 300,
    });
    expect(heldSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
    expect(heldSize({ width: 100_000, height: 1 })).toMatchObject({ height: 1 });
  });
});

describe('stampNameOf', () => {
  it('is the file’s name without its ending, held to the most', () => {
    expect(stampNameOf('Paid in full.png', 64)).toBe('Paid in full');
    expect(stampNameOf('archive.tar.svg', 64)).toBe('archive.tar');
    expect(stampNameOf('logo', 3)).toBe('log');
  });
});

describe('keepPicture', () => {
  it('keeps a PNG that fits as it came, at three quarters of a point a pixel', async () => {
    const bytes = bytesOf(PNG);
    const drawing = drawingOf({ width: 400, height: 200 });
    expect(await keepPicture(bytes, drawing)).toEqual({
      ok: true,
      picture: {
        bytes,
        type: 'png',
        width: 400,
        height: 200,
        natural: { width: 300, height: 150 },
        scaled: false,
        source: 'png',
        pages: null,
      },
    });
    expect(drawing.encode).not.toHaveBeenCalled();
  });

  it('draws a picture past the longest side smaller, in its own form', async () => {
    const drawing = drawingOf({ width: 2400, height: 1200 });
    const kept = await keepPicture(bytesOf([0xff, 0xd8, 0xff, 0xe0]), drawing);
    expect(kept).toMatchObject({
      ok: true,
      picture: { type: 'jpeg', width: 1200, height: 600, scaled: true },
    });
  });

  it('draws a picture past the most bytes smaller until it fits', async () => {
    const drawing = drawingOf({ width: 1000, height: 500 }, (width) =>
      width > 600 ? PDF_STAMP_MAX_BYTES + 1 : 1_000,
    );
    const kept = await keepPicture(bytesOf(PNG, PDF_STAMP_MAX_BYTES + 1), drawing);
    expect(kept).toMatchObject({ ok: true, picture: { width: 562, scaled: true } });
  });

  it('refuses one that never fits as too_large', async () => {
    const drawing = drawingOf({ width: 1000, height: 500 }, () => PDF_STAMP_MAX_BYTES + 1);
    expect(await keepPicture(bytesOf(PNG, PDF_STAMP_MAX_BYTES + 1), drawing)).toEqual({
      ok: false,
      refusal: 'too_large',
    });
  });

  it('draws an SVG into a PNG at its own size', async () => {
    const drawing = drawingOf({ width: 240, height: 120 });
    const kept = await keepPicture(bytesOf('<svg viewBox="0 0 2 1">'), drawing);
    expect(kept).toMatchObject({
      ok: true,
      picture: { type: 'png', width: 240, height: 120, scaled: false, source: 'svg', pages: null },
    });
    expect(drawing.read).toHaveBeenCalledWith(expect.anything(), 'svg');
  });

  it('draws a PDF’s page into a PNG, its natural size the page’s', async () => {
    const drawing = drawingOf(null);
    const kept = await keepPicture(bytesOf('%PDF-1.7\n'), drawing, 2);
    expect(drawing.page).toHaveBeenCalledWith(expect.anything(), 2, PDF_CUSTOM_STAMP_PAGE_SCALE);
    expect(kept).toMatchObject({
      ok: true,
      picture: {
        type: 'png',
        width: 927,
        height: 1200,
        natural: { width: 612, height: 792 },
        source: 'pdf',
        pages: 3,
      },
    });
  });

  it('refuses what is no picture, or one the browser cannot read, as unreadable', async () => {
    expect(await keepPicture(bytesOf('GIF89a'), drawingOf(null))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    expect(await keepPicture(bytesOf(PNG), drawingOf(null))).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    const noPage = { ...drawingOf(null), page: vi.fn(async () => null) };
    expect(await keepPicture(bytesOf('%PDF-1.7'), noPage)).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
  });
});

describe('sniffPicture on hostile markup', () => {
  it('reads many comments in one pass, and an unclosed one as no picture', () => {
    const many = `<!--${'--><!--'.repeat(150)}-->`;
    expect(sniffPicture(bytesOf(`${many}<svg>`, 0))).toBeNull();
    expect(sniffPicture(bytesOf(`<!-- a --><!-- b --><!doctype svg><svg width="2">`))).toBe('svg');
    expect(sniffPicture(bytesOf('<!-- never closed <svg>'))).toBeNull();
  });
});
