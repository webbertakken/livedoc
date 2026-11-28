// A text document's pages as inline pictures (docs/specs/034-text-documents/agents-and-sync.md "Page previews"): the
// api lays the pages out and draws them as SVG (`.../page-previews`), approximately; the caller's `draw` rasterises
// each (image-result.ts, through render-png within the previews' size budget). Render-free, so it tests in Node.
import { ApiError, type ApiClient } from '@livedoc/api-client';
import {
  TEXT_DOCUMENT_PAGE_PREVIEWS_SEGMENT,
  type TextDocumentPagePreviewsResponse,
} from '@livedoc/api-schema';

/** What every text document preview says of itself. */
export const APPROXIMATE_PAGES_NOTE =
  'An approximate preview: pages laid out as the editor lays them, with lines broken by the Inter typeface rather ' +
  'than measured, so a line or a page may break a little differently in the editor.';

type ImageBlock = { type: 'image'; data: string; mimeType: string };

export type TextDocumentPages =
  | {
      readonly ok: true;
      readonly images: readonly ImageBlock[];
      readonly pages: readonly number[];
      readonly pageCount: number;
    }
  | { readonly ok: false; readonly message: string };

/** Pages `pages` (`1` by default) of a text document tab as PNGs, or the api's refusal in its words. */
export async function textDocumentPages(
  api: ApiClient,
  documentId: string,
  tabId: string,
  ask: { pages?: string; only?: string },
  draw: (svg: string) => Promise<string>,
): Promise<TextDocumentPages> {
  const query = new URLSearchParams();
  if (ask.pages !== undefined) query.set('pages', ask.pages);
  if (ask.only !== undefined) query.set('only', ask.only);
  const path = `/documents/${encodeURIComponent(documentId)}/tabs/${encodeURIComponent(tabId)}/${TEXT_DOCUMENT_PAGE_PREVIEWS_SEGMENT}${query.size > 0 ? `?${query.toString()}` : ''}`;
  let drawn: TextDocumentPagePreviewsResponse;
  try {
    drawn = await api.json<TextDocumentPagePreviewsResponse>(path);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
    let message = error.message;
    try {
      const body = JSON.parse(error.body) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // Not the route's JSON: the error's own words stand.
    }
    return { ok: false, message };
  }
  const images: ImageBlock[] = [];
  // One page at a time: resvg holds a whole page's pixels while it draws.
  for (const page of drawn.pages)
    images.push({ type: 'image', data: await draw(page.svg), mimeType: 'image/png' });
  return { ok: true, images, pages: drawn.pages.map((p) => p.number), pageCount: drawn.pageCount };
}
