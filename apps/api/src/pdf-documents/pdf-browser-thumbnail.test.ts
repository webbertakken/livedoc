// docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": the picture is checked as a JPEG
// of the sizes allowed, stripped of its metadata, and placed in a snapshot LiveDoc draws itself.
import { describe, expect, it, vi } from 'vitest';
import { PDF_THUMBNAIL_MAX_BYTES, PDF_THUMBNAIL_MAX_SIDE_PX } from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { browserThumbnailKey, snapshotKeys } from '../db/documents';
import { testImagesBucket } from '../test-images-bucket';
import type { DocumentEnv } from '../types';
import {
  awaitsBrowserThumbnail,
  checkPdfThumbnail,
  isFirstTab,
  pdfBrowserThumbnailSvg,
  pdfThumbnailSvg,
} from './pdf-browser-thumbnail';
import { TEST_JPEG_CAMERA, testJpeg } from './test-jpeg';

const textOf = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8,
  0, 0, 0, 8, 8, 6, 0, 0, 0,
]);

describe('a picture a browser sent of a PDF’s first page', () => {
  // "checked as a JPEG of the sizes above, stripped of its metadata"
  it('is kept as a JPEG without its metadata', () => {
    const sent = testJpeg(480, 679);
    expect(textOf(sent)).toContain(TEST_JPEG_CAMERA);
    const checked = checkPdfThumbnail(sent);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(textOf(checked.jpeg)).not.toContain(TEST_JPEG_CAMERA);
    expect(checked.jpeg.byteLength).toBeLessThan(sent.byteLength);
    expect([...checked.jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it.each([
    ['a PNG', PNG],
    ['no picture at all', new TextEncoder().encode('<svg onload="alert(1)"/>')],
    ['a JPEG with no width', testJpeg(0, 100)],
    ['a JPEG with no height', testJpeg(100, 0)],
    ['a JPEG wider than the longest side', testJpeg(PDF_THUMBNAIL_MAX_SIDE_PX + 1, 100)],
    ['a JPEG taller than the longest side', testJpeg(100, PDF_THUMBNAIL_MAX_SIDE_PX + 1)],
    ['nothing', new Uint8Array()],
  ])('refuses %s as thumbnail_invalid', (_what, bytes) => {
    expect(checkPdfThumbnail(new Uint8Array(bytes))).toEqual({
      ok: false,
      name: 'thumbnail_invalid',
    });
  });

  it('refuses a JPEG whose segments do not hold as thumbnail_invalid', () => {
    const whole = testJpeg(480, 679);
    // A segment that says it is shorter than its own length, after the frame's header: the size reads, the walk
    // that strips the metadata does not hold.
    const scan = whole.findIndex((byte, at) => byte === 0xff && whole[at + 1] === 0xda);
    const broken = Uint8Array.from([
      ...whole.subarray(0, scan),
      0xff,
      0xdb,
      0,
      1,
      ...whole.subarray(scan),
    ]);
    expect(checkPdfThumbnail(broken)).toEqual({ ok: false, name: 'thumbnail_invalid' });
  });

  it('takes one at the longest side and at the limit, and refuses one byte more', () => {
    expect(
      checkPdfThumbnail(testJpeg(PDF_THUMBNAIL_MAX_SIDE_PX, PDF_THUMBNAIL_MAX_SIDE_PX)).ok,
    ).toBe(true);
    const atLimit = testJpeg(480, 679, 100);
    expect(checkPdfThumbnail(atLimit, atLimit.byteLength).ok).toBe(true);
    expect(checkPdfThumbnail(atLimit, atLimit.byteLength - 1)).toEqual({
      ok: false,
      name: 'thumbnail_too_large',
    });
    expect(PDF_THUMBNAIL_MAX_BYTES).toBe(200_000);
  });
});

describe('the snapshot of a PDF tab', () => {
  // "a white page holding the picture"
  it('is a white page of the picture’s size holding it, and nothing else', () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
    expect(pdfThumbnailSvg(jpeg, 480, 679)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 679" width="480" height="679">' +
        '<rect width="480" height="679" fill="#ffffff"/>' +
        `<image width="480" height="679" href="data:image/jpeg;base64,${base64OfBytes(jpeg)}"/>` +
        '</svg>',
    );
  });

  it('is drawn from the picture stored for the tab, read from its bytes', async () => {
    const images = testImagesBucket();
    const jpeg = testJpeg(480, 679);
    await images.put(browserThumbnailKey('D'), jpeg, {
      customMetadata: { tab: 't1', savedAt: '5' },
    });
    expect(await pdfBrowserThumbnailSvg(images, 'D', 't1')).toBe(pdfThumbnailSvg(jpeg, 480, 679));
  });

  it('is none when no picture was sent, or the one stored is of another tab', async () => {
    const images = testImagesBucket();
    expect(await pdfBrowserThumbnailSvg(images, 'D', 't1')).toBeNull();
    await images.put(browserThumbnailKey('D'), testJpeg(480, 679), {
      customMetadata: { tab: 't1', savedAt: '5' },
    });
    expect(await pdfBrowserThumbnailSvg(images, 'D', 't2')).toBeNull();
  });

  it('is none, and said, when what is stored is no JPEG', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const images = testImagesBucket();
    await images.put(browserThumbnailKey('D'), PNG, { customMetadata: { tab: 't1' } });
    expect(await pdfBrowserThumbnailSvg(images, 'D', 't1')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[pdf] browser-thumbnail unreadable document=D');
    warn.mockRestore();
  });

  // "all of it goes with the document"
  it('is among what a deleted document takes with it', () => {
    expect(browserThumbnailKey('D')).toBe('thumb/D/browser');
    expect(snapshotKeys('D')).toContain('thumb/D/browser');
  });
});

/** A document whose first tab is stored as given: its row, or none. */
const documentWith = (row: { id: string; data: string } | null) =>
  ({
    DOCUMENT_DB: {
      prepare: () => ({
        bind: () => ({ first: async () => (row ? { ...row, element_count: null } : null) }),
      }),
    },
  }) as unknown as DocumentEnv;

describe('the first tab of a document', () => {
  const pdf = documentWith({ id: 't1', data: JSON.stringify({ kind: 'pdf', elements: [] }) });
  const canvas = documentWith({ id: 't1', data: JSON.stringify({ elements: [] }) });
  const unreadable = documentWith({ id: 't1', data: 'not a tab' });
  const empty = documentWith(null);

  it('is the tab a snapshot is of, and no other', async () => {
    expect(await isFirstTab(pdf, 'D', 't1')).toBe(true);
    expect(await isFirstTab(pdf, 'D', 't2')).toBe(false);
    expect(await isFirstTab(empty, 'D', 't1')).toBe(false);
    expect(await isFirstTab(unreadable, 'D', 't1')).toBe(false);
  });

  it('waits on a browser’s picture when it is a PDF, and only then', async () => {
    expect(await awaitsBrowserThumbnail(pdf, 'D')).toBe(true);
    expect(await awaitsBrowserThumbnail(canvas, 'D')).toBe(false);
    expect(await awaitsBrowserThumbnail(unreadable, 'D')).toBe(false);
    expect(await awaitsBrowserThumbnail(empty, 'D')).toBe(false);
  });
});
