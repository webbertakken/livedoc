// A browser's thumbnail of a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail"): LiveDoc's servers hold no PDF engine, so an Editor's open surface sends the first page as it shows it,
// the live marks over it, for the lists to draw. It asks whether one is wanted when it opens, and sends one again
// once its own changes have been quiet and confirmed. Nothing waits on it, and a failure changes nothing: it is
// logged, and the next change tries again.
import type * as Y from 'yjs';
import {
  PDF_THUMBNAIL_IDLE_MS,
  PDF_THUMBNAIL_MAX_BYTES,
  PDF_THUMBNAIL_MAX_SIDE_PX,
  PDF_THUMBNAIL_MIN_INTERVAL_MS,
  PDF_THUMBNAIL_WIDTH_PX,
  type Mark,
  type PageBitmap,
  type PageInfo,
  type PdfEngine,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';

/** The qualities a picture is made at: the second only when the first is past the limit. */
const QUALITIES = [0.85, 0.6] as const;

/** What the picture is made of: the page as the engine drew it, and the live marks on it. */
export type PdfThumbnailPicture = { bitmap: PageBitmap; marks: readonly Mark[] };

export type PdfThumbnailDeps = {
  tabId: string;
  /** The live changes: a change made here is what sends a picture again. */
  doc: Y.Doc;
  /** The first page, and the live marks on it now. */
  page: PageInfo;
  marks: () => readonly Mark[];
  engine: Pick<PdfEngine, 'drawPage'>;
  /** Whether this session may send one: an Editor's alone. */
  canSend: () => boolean;
  /** Whether the room holds every change made here. */
  isSaved: () => boolean;
  /** Asks LiveDoc whether a picture is wanted. */
  wanted: () => Promise<boolean>;
  send: (jpeg: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** The picture as a JPEG at that quality, or null where the browser cannot make one. */
  encode: (
    picture: PdfThumbnailPicture,
    quality: number,
  ) => Promise<Uint8Array<ArrayBuffer> | null>;
  /** A picture was sent: what this browser kept of the earlier one is out of date. */
  onSent?: () => void;
  /** The limits, the spec's unless a test sizes them. */
  idleMs?: number;
  minIntervalMs?: number;
  maxBytes?: number;
};

export type PdfThumbnailWatch = {
  /** Stop watching: a surface that goes. */
  stop: () => void;
  /** Settles once whatever is under way has ended, however it ended. */
  settled: () => Promise<void>;
};

/**
 * The scale the first page is drawn at (1 is 72 dpi): the thumbnail's width, less where a side would pass the
 * longest the server takes.
 */
export function thumbnailScale(page: Pick<PageInfo, 'width' | 'height'>): number {
  // One pixel under, so the engine's rounding never lands a side past it.
  const longest = (PDF_THUMBNAIL_MAX_SIDE_PX - 1) / Math.max(page.width, page.height);
  return Math.min(PDF_THUMBNAIL_WIDTH_PX / page.width, longest);
}

export function watchPdfThumbnail(deps: PdfThumbnailDeps): PdfThumbnailWatch {
  const { tabId, doc } = deps;
  const idleMs = deps.idleMs ?? PDF_THUMBNAIL_IDLE_MS;
  const minIntervalMs = deps.minIntervalMs ?? PDF_THUMBNAIL_MIN_INTERVAL_MS;
  const maxBytes = deps.maxBytes ?? PDF_THUMBNAIL_MAX_BYTES;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sentAt: number | null = null;
  let chain: Promise<void> = Promise.resolve();

  const skipped = (reason: string) =>
    debugLog(`[pdf] thumbnail-skipped reason=${reason}`, { tabId });

  const picture = async (): Promise<Uint8Array<ArrayBuffer> | null> => {
    const bitmap = await deps.engine.drawPage(0, thumbnailScale(deps.page));
    if (!bitmap) return (skipped('draw'), null);
    for (const quality of QUALITIES) {
      const jpeg = await deps.encode({ bitmap, marks: deps.marks() }, quality);
      if (!jpeg) return (skipped('encode'), null);
      if (jpeg.byteLength <= maxBytes) {
        debugLog(`[pdf] thumbnail-sent bytes=${jpeg.byteLength} quality=${quality}`, { tabId });
        return jpeg;
      }
    }
    return (skipped('too_large'), null);
  };

  const sendOne = async () => {
    const jpeg = await picture();
    if (!jpeg || stopped) return;
    await deps.send(jpeg);
    sentAt = Date.now();
    deps.onSent?.();
  };

  /** One thing at a time, and never a rejection: whatever fails is logged and left. */
  const run = (step: () => Promise<void>) => {
    chain = chain.then(async () => {
      if (stopped) return;
      try {
        await step();
      } catch (error) {
        skipped(`failed error=${String(error)}`);
      }
    });
  };

  const arm = (ms: number) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(quiet, ms);
  };

  // The surface's own changes have been quiet for the idle time.
  function quiet() {
    timer = null;
    if (!deps.canSend()) return;
    // Not confirmed yet: looked at again after another idle time.
    if (!deps.isSaved()) return arm(idleMs);
    const wait = sentAt === null ? 0 : sentAt + minIntervalMs - Date.now();
    if (wait > 0) return arm(wait);
    run(sendOne);
  }

  const onUpdate = (
    _update: Uint8Array,
    _origin: unknown,
    _doc: Y.Doc,
    transaction: Y.Transaction,
  ) => {
    if (transaction.local && deps.canSend()) arm(idleMs);
  };
  doc.on('update', onUpdate);

  // Opened: the first page is there to be drawn.
  if (deps.canSend())
    run(async () => {
      if (await deps.wanted()) await sendOne();
    });

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      doc.off('update', onUpdate);
    },
    settled: () => chain,
  };
}
