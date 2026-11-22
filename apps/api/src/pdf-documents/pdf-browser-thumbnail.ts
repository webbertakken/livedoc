// A browser's thumbnail of a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail"): the api Worker holds no PDF engine, so the first page a list shows is a picture an Editor's surface
// sent. It is for display only: checked as a JPEG of the sizes allowed, stripped of its metadata, stored apart from
// the snapshots drawn from it, and placed by this module in an SVG of its own making, so nothing in it reaches a
// page as markup.
import { tabKindOf, type Tab } from '@livedoc/document';
import { pictureHeader } from '@livedoc/office-packages';
import { PDF_THUMBNAIL_MAX_BYTES, PDF_THUMBNAIL_MAX_SIDE_PX } from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents';
import { browserThumbnailKey, markThumbRendered, snapshotKeys } from '../db/documents';
import { getTabBody } from '../db/tabs';
import { stripJpegMetadata } from '../image-strip';
import type { DocumentEnv } from '../types';

/** The object's own words for the save it was sent at and the tab it shows. */
const SENT_AT = 'savedAt';
const OF_TAB = 'tab';

export type PdfThumbnailRefusal = 'thumbnail_invalid' | 'thumbnail_too_large';
export type PdfThumbnailChecked =
  { ok: true; jpeg: Uint8Array<ArrayBuffer> } | { ok: false; name: PdfThumbnailRefusal };

const sideOk = (side: number) => side >= 1 && side <= PDF_THUMBNAIL_MAX_SIDE_PX;

/**
 * What a browser sent, as it may be stored: a JPEG of the sizes allowed, without its metadata. `maxBytes`: the limit
 * unless a test hands a smaller.
 */
export function checkPdfThumbnail(
  bytes: Uint8Array<ArrayBuffer>,
  maxBytes = PDF_THUMBNAIL_MAX_BYTES,
): PdfThumbnailChecked {
  if (bytes.byteLength > maxBytes) return { ok: false, name: 'thumbnail_too_large' };
  const header = pictureHeader(bytes);
  if (header?.mediaType !== 'image/jpeg' || !sideOk(header.width) || !sideOk(header.height))
    return { ok: false, name: 'thumbnail_invalid' };
  try {
    return { ok: true, jpeg: new Uint8Array(stripJpegMetadata(bytes.buffer)) };
  } catch {
    return { ok: false, name: 'thumbnail_invalid' };
  }
}

/** A white page holding the picture: always light paper. */
export function pdfThumbnailSvg(jpeg: Uint8Array, width: number, height: number): string {
  const box = `width="${width}" height="${height}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ${box}>` +
    `<rect ${box} fill="#ffffff"/>` +
    `<image ${box} href="data:image/jpeg;base64,${base64OfBytes(jpeg)}"/>` +
    `</svg>`
  );
}

/**
 * The snapshot of a PDF tab: the picture a browser sent of it, or null when none was. A document keeps one picture,
 * of its first tab: any other PDF tab of it has none.
 */
export async function pdfBrowserThumbnailSvg(
  images: R2Bucket,
  documentId: string,
  tabId: string,
): Promise<string | null> {
  const stored = await images.get(browserThumbnailKey(documentId));
  if (!stored || stored.customMetadata?.[OF_TAB] !== tabId) return null;
  const jpeg = new Uint8Array(await stored.arrayBuffer());
  // Read from the bytes again, never from what was said of them.
  const header = pictureHeader(jpeg);
  if (header?.mediaType !== 'image/jpeg') {
    console.warn(`[pdf] browser-thumbnail unreadable document=${documentId}`);
    return null;
  }
  return pdfThumbnailSvg(jpeg, header.width, header.height);
}

async function firstTab(env: DocumentEnv, documentId: string): Promise<Partial<Tab> | null> {
  const body = await getTabBody(env, documentId);
  if (!body) return null;
  try {
    return { ...(JSON.parse(body.data) as Partial<Tab>), id: body.id };
  } catch {
    return null;
  }
}

/** Whether the tab is its document's first: a snapshot is of the first tab. */
export async function isFirstTab(env: DocumentEnv, documentId: string, tabId: string) {
  return (await firstTab(env, documentId))?.id === tabId;
}

/** Whether the document's snapshot waits on a browser: its first tab is a PDF. */
export async function awaitsBrowserThumbnail(env: DocumentEnv, documentId: string) {
  const tab = await firstTab(env, documentId);
  return tab !== null && tabKindOf(tab) === 'pdf';
}

/**
 * Whether a picture is wanted of the tab: the server keeps snapshots, the tab is the document's first, and no
 * picture is stored or the one stored was sent before the document was last saved.
 */
export async function pdfThumbnailWanted(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  savedAt: number,
): Promise<boolean> {
  if (!env.IMAGES || !(await isFirstTab(env, documentId, tabId))) return false;
  const stored = await env.IMAGES.head(browserThumbnailKey(documentId));
  // A picture of a tab that was the first before the tabs were moved is none of this one.
  if (stored?.customMetadata?.[OF_TAB] !== tabId) return true;
  return !(Number(stored.customMetadata[SENT_AT]) >= savedAt);
}

/**
 * Store the picture, marked as a browser's and with the save it was sent at, and remove every snapshot drawn from
 * the one before it, so the next read draws from this one.
 */
export async function storePdfBrowserThumbnail(
  env: DocumentEnv,
  images: R2Bucket,
  { documentId, tabId }: { documentId: string; tabId: string },
  jpeg: Uint8Array<ArrayBuffer>,
  savedAt: number,
): Promise<void> {
  const key = browserThumbnailKey(documentId);
  await images.put(key, jpeg, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { [SENT_AT]: String(savedAt), [OF_TAB]: tabId, source: 'browser' },
  });
  await images.delete(snapshotKeys(documentId).filter((drawn) => drawn !== key));
  await markThumbRendered(env, documentId, 0);
}
