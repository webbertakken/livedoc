// Share-link previews (docs/specs/013-workspace/share-link-previews.md): the two doors a link preview reads.
//
//   GET /api/share/<code>/card       { name } for the live app's worker, which writes it into the share page's head;
//   GET /api/share/<code>/image.png  the share card, a 1200 x 630 PNG of the link's live-image drawing.
//
// Both answer exactly where the live image (GET /api/share/<code>/image.svg) answers, so a preview never says more
// about a link than its image already does: an unknown, revoked or expired code, a trashed document, a document with a
// share password are all 404.

import { BRAND_CARD_PATH, type SharePreviewResponse } from '@livedoc/api-schema';
import { getSharePreviewSubject, shareCardKey } from '../db';
import { documentImageSvg } from '../document-image';
import { json, notFound, pngImage } from '../responses';
import { shareCardPng } from '../share-card-png';
import type { DocumentRouteContext, RouteContext } from './context';

// A link's card changes only when its document is saved, and a chat app keeps its own copy for far longer, so a
// few minutes fresh and an hour stale costs nothing in accuracy.
export const SHARE_CARD_CACHE = 'public, max-age=300, stale-while-revalidate=3600';
// The brand card stands in for a document with nothing to draw yet; short, so its first drawing shows soon after.
export const BRAND_CARD_REDIRECT_CACHE = 'public, max-age=300';

// `api/share/<code>/card` and `.../image.png`, as the worker splits them. The share rate limiter keys these apart
// from the share resolve, so a room of people opening one link never spends the editor's budget on previews.
export function isSharePreviewPath(segments: readonly string[]): boolean {
  return (
    segments.length === 4 &&
    segments[1] === 'share' &&
    (segments[3] === 'card' || segments[3] === 'image.png')
  );
}

// The card's text (`/card`), answered in the worker; null for every other path, so the share router falls through
// to its own answers. The card's image (`/image.png`) is drawn by the document's room (shareCardImage).
export async function handleSharePreview(ctx: RouteContext): Promise<Response | null> {
  const { request, segments } = ctx;
  if (!isSharePreviewPath(segments) || segments[3] !== 'card' || request.method !== 'GET')
    return null;
  return shareCard(ctx, segments[2]!);
}

async function shareCard(ctx: RouteContext, code: string): Promise<Response> {
  // The one gate both doors share, the live image's rules, asked in one query.
  const subject = await getSharePreviewSubject(ctx.env, code);
  if (!subject) return notFound();
  const body: SharePreviewResponse = { name: subject.doc.name };
  return json(body);
}

// The brand card, on the origin the request came in on (the router serves it beside the api).
function brandCard(url: URL): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(BRAND_CARD_PATH, url.origin).toString(),
      'Cache-Control': BRAND_CARD_REDIRECT_CACHE,
    },
  });
}

export async function shareCardImage(ctx: DocumentRouteContext, code: string): Promise<Response> {
  const { env, url } = ctx;
  const subject = await getSharePreviewSubject(env, code);
  if (!subject) return notFound();
  const { doc, tabId } = subject;
  // A tab-scoped link's card is drawn per request, as its tab's live image is: one object per document holds the
  // first tab only.
  const key = tabId !== null ? null : shareCardKey(doc.id);
  const images = env.IMAGES;
  if (key && images) {
    const cached = await images.get(key);
    if (cached && Number(cached.customMetadata?.renderedAt ?? 0) >= doc.savedAt) {
      return pngImage(cached.body, SHARE_CARD_CACHE);
    }
  }
  // Stamped before the drawing is read, so a save landing mid-render leaves the stored card stale, never fresh.
  const drawnAt = Date.now();
  const svg = await documentImageSvg(env, doc, tabId, { defer: ctx.waitUntil });
  if (svg == null) return brandCard(url);
  let png: Uint8Array | null;
  try {
    png = await shareCardPng(svg);
  } catch (err) {
    console.warn('[share-card] render failed', { documentId: doc.id, error: String(err) });
    return brandCard(url);
  }
  if (png === null) {
    console.warn('[share-card] drawing has no sized root', { documentId: doc.id });
    return brandCard(url);
  }
  if (key && images) {
    const write = images
      .put(key, png, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { renderedAt: String(drawnAt) },
      })
      .catch((err: unknown) => {
        // Best effort: the card is still served; the next preview draws it again.
        console.warn('[share-card] cache write failed', { documentId: doc.id, error: String(err) });
      });
    ctx.waitUntil?.(write);
  }
  return pngImage(png, SHARE_CARD_CACHE);
}
