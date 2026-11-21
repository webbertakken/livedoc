// A picture IMAGE shows (docs/specs/029-sheets/imports.md "IMAGE"): GET .../workbook/imports?kind=image&url=…, past
// the imports' gates (read access, SHEET_IMPORTS, Allow Access), fetched with public-fetch.ts's guards, known by its
// first bytes and answered as them, so the viewer's browser only ever talks to LiveDoc. Kept an hour for everyone.
import { importUrl } from '@livedoc/sheets';
import { fetchPublicBytes } from '../public-fetch';
import { rasterImage, rateLimited } from '../responses';
import { sniffImage } from '../sniff-image';
import type { DocumentRouteContext } from './context';
import {
  IMPORT_CACHE_S,
  IMPORT_FETCH_MS,
  IMPORT_REDIRECTS_MAX,
  IMPORT_USER_AGENT,
} from './sheet-import-bounds';
import { workbookRefused } from './sheet-route-kit';

/** A picture's largest size (D73): a photograph's, well inside the Worker's memory. Safe range 1 to 25 MB. */
export const IMAGE_BYTES_MAX = 10 * 1024 * 1024;
const ACCEPT = 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8';
// Where Google refuses to fetch a picture from (verified: Google's help).
const REFUSED_HOSTS: ReadonlySet<string> = new Set(['drive.google.com']);
// The cache's own address space: never fetched, only a key.
const CACHE_ORIGIN = 'https://sheet-images.cache.invalid/';

function cacheStore(): Cache | null {
  return typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
}

async function cacheKey(url: string): Promise<Request> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request(`${CACHE_ORIGIN}${hex}`);
}

const cacheControl = `private, max-age=${IMPORT_CACHE_S}`;

export async function fetchSheetImage(
  ctx: DocumentRouteContext,
  documentId: string,
): Promise<Response> {
  const url = importUrl(ctx.url.searchParams.get('url') ?? '');
  if (!url) return workbookRefused('import_invalid', 400);
  const host = new URL(url).hostname;
  if (REFUSED_HOSTS.has(host)) {
    console.info('[imports] refused', { documentId, host, kind: 'image', reason: 'host_refused' });
    return workbookRefused('image_refused', 422);
  }
  const cache = cacheStore();
  const key = cache ? await cacheKey(url) : null;
  if (cache && key) {
    const hit = await cache.match(key);
    if (hit)
      return rasterImage(
        new Uint8Array(await hit.arrayBuffer()),
        hit.headers.get('content-type')!,
        cacheControl,
      );
  }
  const limiter = ctx.env.SHEET_IMPORT_RATE_LIMITER;
  if (limiter && !(await limiter.limit({ key: `sheet-import:${documentId}` })).success) {
    console.info('[imports] refused', { documentId, host, kind: 'image', reason: 'rate_limited' });
    return rateLimited();
  }
  const started = Date.now();
  const got = await fetchPublicBytes(url, {
    timeoutMs: IMPORT_FETCH_MS,
    maxBytes: IMAGE_BYTES_MAX,
    maxRedirects: IMPORT_REDIRECTS_MAX,
    userAgent: IMPORT_USER_AGENT,
    accept: ACCEPT,
  });
  const ms = Date.now() - started;
  if (!got.ok) {
    console.warn('[imports] failed', { documentId, host, kind: 'image', reason: got.reason, ms });
    return workbookRefused('image_refused', 422);
  }
  const type = sniffImage(got.bytes);
  if (!type) {
    console.info('[imports] refused', {
      documentId,
      host,
      kind: 'image',
      reason: 'not_an_image',
      ms,
    });
    return workbookRefused('image_refused', 422);
  }
  console.info('[imports] fetched', {
    documentId,
    host,
    kind: 'image',
    type,
    bytes: got.bytes.byteLength,
    ms,
  });
  if (cache && key)
    ctx.waitUntil?.(
      cache.put(
        key,
        new Response(got.bytes, {
          headers: { 'content-type': type, 'cache-control': `max-age=${IMPORT_CACHE_S}` },
        }),
      ),
    );
  return rasterImage(got.bytes, type, cacheControl);
}
