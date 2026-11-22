// docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": an Editor's surface asks whether
// a picture of the first page is wanted, sends one when it is, and again after its own changes settle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  PDF_THUMBNAIL_IDLE_MS,
  PDF_THUMBNAIL_MAX_SIDE_PX,
  PDF_THUMBNAIL_MIN_INTERVAL_MS,
  PDF_THUMBNAIL_WIDTH_PX,
  type Mark,
  type PageBitmap,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { thumbnailScale, watchPdfThumbnail, type PdfThumbnailDeps } from './pdf-thumbnail';

const PAGE: PageInfo = {
  name: 'p:1',
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
};
const BITMAP = {
  width: 480,
  height: 621,
  rgba: new Uint8ClampedArray(4),
  toView: [1, 0, 0, 1, 0, 0],
};
const MARK = { id: 'm1' } as Mark;
const jpegOf = (bytes: number) => new Uint8Array(bytes);

function surface(over: Partial<PdfThumbnailDeps> = {}) {
  const doc = new Y.Doc();
  const sent: number[] = [];
  const deps = {
    tabId: 't1',
    doc,
    page: PAGE,
    marks: () => [MARK],
    engine: { drawPage: vi.fn(async () => BITMAP as unknown as PageBitmap) },
    canSend: () => true,
    isSaved: () => true,
    wanted: vi.fn(async () => true),
    send: vi.fn(async (jpeg: Uint8Array) => void sent.push(jpeg.byteLength)),
    encode: vi.fn(async () => jpegOf(40_000)),
    onSent: vi.fn(),
    ...over,
  } satisfies PdfThumbnailDeps;
  const watch = watchPdfThumbnail(deps);
  /** A change made on this surface, and one that came from someone else. */
  const change = () => doc.getMap('marks').set(String(Math.random()), 1);
  const changeFromElsewhere = () => {
    const other = new Y.Doc();
    other.getMap('marks').set('theirs', 1);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
  };
  return { deps, watch, sent, change, changeFromElsewhere };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('the size a PDF’s first page is drawn at for its thumbnail', () => {
  // "PDF_THUMBNAIL_WIDTH_PX wide, smaller where a side would pass PDF_THUMBNAIL_MAX_SIDE_PX"
  it('is the thumbnail’s width', () => {
    expect(PAGE.width * thumbnailScale(PAGE)).toBeCloseTo(PDF_THUMBNAIL_WIDTH_PX);
  });

  it('is smaller where the page is so tall a side would pass the longest', () => {
    const receipt = { ...PAGE, width: 200, height: 2_000 };
    const scale = thumbnailScale(receipt);
    expect(Math.ceil(receipt.height * scale)).toBeLessThanOrEqual(PDF_THUMBNAIL_MAX_SIDE_PX);
    expect(receipt.width * scale).toBeLessThan(PDF_THUMBNAIL_WIDTH_PX);
  });
});

describe('an Editor’s surface and its PDF’s thumbnail', () => {
  // "the surface asks whether one is wanted once it has drawn the first page, and sends one when it is"
  it('asks when it opens, and sends the first page with its marks when one is wanted', async () => {
    const s = surface();
    await s.watch.settled();
    expect(s.deps.wanted).toHaveBeenCalledTimes(1);
    expect(s.deps.engine.drawPage).toHaveBeenCalledWith(0, thumbnailScale(PAGE));
    expect(s.deps.encode).toHaveBeenCalledWith({ bitmap: BITMAP, marks: [MARK] }, 0.85);
    expect(s.sent).toEqual([40_000]);
    expect(s.deps.onSent).toHaveBeenCalledTimes(1);
  });

  it('sends none when none is wanted', async () => {
    const s = surface({ wanted: vi.fn(async () => false) });
    await s.watch.settled();
    expect(s.deps.engine.drawPage).not.toHaveBeenCalled();
    expect(s.sent).toEqual([]);
  });

  // "Who sends one: an Editor's open surface"
  it('never asks or sends for anyone but an Editor', async () => {
    const s = surface({ canSend: () => false });
    await s.watch.settled();
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS * 2);
    await s.watch.settled();
    expect(s.deps.wanted).not.toHaveBeenCalled();
    expect(s.sent).toEqual([]);
  });

  // "it sends one PDF_THUMBNAIL_IDLE_MS after its own last change was confirmed"
  it('sends one again once its own changes have been quiet and confirmed', async () => {
    const s = surface({ wanted: vi.fn(async () => false) });
    await s.watch.settled();
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS - 1_000);
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS - 1);
    expect(s.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await s.watch.settled();
    expect(s.sent).toEqual([40_000]);
    // Not asked: this surface knows it changed the PDF.
    expect(s.deps.wanted).toHaveBeenCalledTimes(1);
  });

  it('waits for a change the room has not confirmed yet', async () => {
    let saved = false;
    const s = surface({ wanted: vi.fn(async () => false), isSaved: () => saved });
    await s.watch.settled();
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS);
    await s.watch.settled();
    expect(s.sent).toEqual([]);
    saved = true;
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS);
    await s.watch.settled();
    expect(s.sent).toEqual([40_000]);
  });

  it('sends nothing for a change that came from someone else', async () => {
    const s = surface({ wanted: vi.fn(async () => false) });
    await s.watch.settled();
    s.changeFromElsewhere();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS * 2);
    await s.watch.settled();
    expect(s.sent).toEqual([]);
  });

  // "at most once every PDF_THUMBNAIL_MIN_INTERVAL_MS"
  it('sends at most one a minute, the later one once the minute is up', async () => {
    const s = surface();
    await s.watch.settled();
    expect(s.sent).toHaveLength(1);
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS);
    await s.watch.settled();
    expect(s.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_MIN_INTERVAL_MS - PDF_THUMBNAIL_IDLE_MS - 1);
    await s.watch.settled();
    expect(s.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await s.watch.settled();
    expect(s.sent).toHaveLength(2);
  });

  // "drawn again once at a lower quality when it is more, then given up"
  it('draws a picture past the limit again at a lower quality, and sends that', async () => {
    const encode = vi.fn(async (_picture: unknown, quality: number) =>
      jpegOf(quality > 0.7 ? 300_000 : 90_000),
    );
    const s = surface({ encode });
    await s.watch.settled();
    expect(encode.mock.calls.map((call) => call[1])).toEqual([0.85, 0.6]);
    expect(s.sent).toEqual([90_000]);
  });

  it('gives up a picture still past the limit at the lower quality', async () => {
    const s = surface({ encode: vi.fn(async () => jpegOf(300_000)) });
    await s.watch.settled();
    expect(s.deps.encode).toHaveBeenCalledTimes(2);
    expect(s.sent).toEqual([]);
  });

  // "Nothing waits on it and a failure changes nothing: it is logged."
  it.each([
    ['the question fails', { wanted: vi.fn(async () => Promise.reject(new Error('offline'))) }],
    ['the page cannot be drawn', { engine: { drawPage: vi.fn(async () => null) } }],
    ['the browser cannot make the picture', { encode: vi.fn(async () => null) }],
    ['the send is refused', { send: vi.fn(async () => Promise.reject(new Error('403'))) }],
  ])('changes nothing when %s, and tries again after the next change', async (_what, over) => {
    const s = surface(over);
    await s.watch.settled();
    expect(s.deps.onSent).not.toHaveBeenCalled();
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS);
    await expect(s.watch.settled()).resolves.toBeUndefined();
  });

  it('does nothing more once stopped', async () => {
    const s = surface({ wanted: vi.fn(async () => false) });
    await s.watch.settled();
    s.change();
    s.watch.stop();
    s.change();
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS * 2);
    await s.watch.settled();
    expect(s.sent).toEqual([]);
  });

  it('asks nothing when it is stopped as it opens', async () => {
    const s = surface();
    s.watch.stop();
    await s.watch.settled();
    expect(s.deps.wanted).not.toHaveBeenCalled();
  });

  it('sends nothing for a session whose level was lowered while its change was quiet', async () => {
    let level = 'edit';
    const s = surface({ wanted: vi.fn(async () => false), canSend: () => level === 'edit' });
    await s.watch.settled();
    s.change();
    level = 'participate';
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_IDLE_MS);
    await s.watch.settled();
    expect(s.sent).toEqual([]);
  });

  it('sends nothing when it is stopped while the first page is being drawn', async () => {
    let drawn = (_bitmap: PageBitmap | null) => {};
    const drawPage = vi.fn(() => new Promise<PageBitmap | null>((resolve) => (drawn = resolve)));
    const s = surface({ engine: { drawPage } });
    await vi.advanceTimersByTimeAsync(0);
    s.watch.stop();
    drawn(BITMAP as unknown as PageBitmap);
    await s.watch.settled();
    expect(s.sent).toEqual([]);
  });
});
