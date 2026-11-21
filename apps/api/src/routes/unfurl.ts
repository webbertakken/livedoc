// GET /api/unfurl?url=<encoded> — server-side link "unfurl" for the link-card
// element (docs/specs/009-elements/link-cards.md). The static client can't read cross-origin page HTML, so
// the worker fetches the page and extracts title / og:image / site name /
// favicon. PUBLIC + self-hostable repo, so the target URL is validated for
// SSRF before any fetch and the read is bounded. Always returns 200 with at
// least the resolved url (the card falls back to the bare URL on a miss).

import type { UnfurlResult } from '@livedoc/api-schema';
import { badRequest, json, notFound, rateLimited } from '../responses';
import { clientRateKey } from '../client-ip';
import type { RouteContext } from './context';
import { parsePublicHttpUrl } from '../public-fetch';

export { isBlockedHost, parsePublicHttpUrl } from '../public-fetch';

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024; // only the <head> is needed
const USER_AGENT = 'livedoc-unfurl/1.0 (+https://docs.nu)';

// --- Pure helpers (unit-tested) -------------------------------------------

// The raw <head> fields HTMLRewriter collects; everything optional.
type CollectedMeta = {
  title?: string;
  ogTitle?: string;
  ogSiteName?: string;
  ogImage?: string;
  ogDescription?: string;
  metaDescription?: string;
  iconHref?: string;
};

// Normalise collected fields into the public result against the final
// (post-redirect) URL: prefer og:* over the bare tags, resolve relative
// image/favicon to absolute, fall back to /favicon.ico.
export function buildUnfurlResult(collected: CollectedMeta, finalUrl: string): UnfurlResult {
  let base: URL | null = null;
  try {
    base = new URL(finalUrl);
  } catch {
    base = null;
  }
  const abs = (href?: string): string | undefined => {
    if (!href || !base) return undefined;
    try {
      return new URL(href, base).toString();
    } catch {
      return undefined;
    }
  };
  const clean = (s?: string) => {
    const t = s?.trim();
    return t && t.length > 0 ? t : undefined;
  };
  return {
    url: finalUrl,
    title: clean(collected.ogTitle) ?? clean(collected.title),
    siteName: clean(collected.ogSiteName),
    description: clean(collected.ogDescription) ?? clean(collected.metaDescription),
    image: abs(collected.ogImage),
    favicon: abs(collected.iconHref) ?? abs('/favicon.ico'),
  };
}

// --- Handler --------------------------------------------------------------

async function collectMeta(res: Response, maxBytes: number): Promise<CollectedMeta> {
  const collected: CollectedMeta = {};
  let titleBuf = '';
  const rewriter = new HTMLRewriter()
    .on('title', {
      text(t) {
        titleBuf += t.text;
      },
    })
    .on('meta', {
      element(el) {
        const prop = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').toLowerCase();
        const content = el.getAttribute('content');
        if (!prop || !content) return;
        if (prop === 'og:title') collected.ogTitle ??= content;
        else if (prop === 'og:site_name') collected.ogSiteName ??= content;
        else if (prop === 'og:image' || prop === 'og:image:url') collected.ogImage ??= content;
        else if (prop === 'og:description') collected.ogDescription ??= content;
        else if (prop === 'description') collected.metaDescription ??= content;
      },
    })
    .on('link', {
      element(el) {
        const rel = (el.getAttribute('rel') ?? '').toLowerCase();
        if (!collected.iconHref && rel.includes('icon')) {
          const href = el.getAttribute('href');
          if (href) collected.iconHref = href;
        }
      },
    });
  const transformed = rewriter.transform(res);
  // A response body streams bytes; the Workers types leave its chunks untyped.
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = transformed.body?.getReader();
  if (reader) {
    let read = 0;
    while (read < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value?.byteLength ?? 0;
    }
    await reader.cancel().catch(() => {});
  }
  collected.title = titleBuf.trim() || undefined;
  return collected;
}

export async function handleUnfurl(ctx: RouteContext): Promise<Response> {
  const { request, env, url, segments } = ctx;
  if (segments.length !== 2 || request.method !== 'GET') return notFound();

  // Per-IP throttle: it's an unauthenticated outbound fetch, so bound abuse.
  if (env.UNFURL_RATE_LIMITER) {
    const ip = clientRateKey(request);
    if (!(await env.UNFURL_RATE_LIMITER.limit({ key: ip })).success) return rateLimited();
  }

  const target = url.searchParams.get('url');
  if (!target) return badRequest('missing url');
  const parsed = parsePublicHttpUrl(target);
  if (!parsed) return badRequest('invalid or disallowed url');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
  } catch {
    clearTimeout(timer);
    // Network error / timeout: hand back the bare URL so the card still renders.
    return json({ url: parsed.toString() } satisfies UnfurlResult);
  }
  clearTimeout(timer);

  // Re-validate the FINAL url after any redirects, so a redirect to a private
  // host can't leak data back through the card.
  const finalParsed = parsePublicHttpUrl(res.url || parsed.toString());
  if (!finalParsed) return badRequest('redirected to a disallowed url');
  const finalUrl = finalParsed.toString();

  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('html')) {
    // Not an HTML page (PDF, image, …): no metadata, but still offer a favicon.
    return json(buildUnfurlResult({}, finalUrl));
  }
  const collected = await collectMeta(res, MAX_HTML_BYTES);
  return json(buildUnfurlResult(collected, finalUrl));
}
