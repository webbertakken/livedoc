// The share page's head (docs/specs/013-workspace/share-link-previews.md). `/document/shared?s=<code>` is the same
// static shell as every document, so a link preview, whose crawler never runs the page's script, saw "LiveDoc"
// over an empty box. For a link whose preview may name its document, the api answers its name, and the shell's head
// closes with it and the share card.
//
// The head never waits on the api: its title and preview tags come out of the shell, the rest of the head (every
// style and script, the inline ones that must run before any chunk) goes out at once, and the tags close the head
// when the api answers. A person's browser fetches the editor's code meanwhile; a crawler reads the whole page.
//
// Without the API binding (a self-host that leaves it out), the shell goes out as built. When the api is slow or says
// no, the head closes with the shell's own title and tags, with the brand card the root layout declares.

import {
  shareCardImagePath,
  sharePreviewCardPath,
  type SharePreviewResponse,
} from '@livedoc/api-schema';
import { xmlEscape } from '@livedoc/icons/xml';

// The few runtime types used here, written out so the app's one DOM-lib typecheck covers this file too.
export type Fetcher = { fetch: (input: Request | string, init?: RequestInit) => Promise<Response> };
type RewriterElement = { getAttribute(name: string): string | null; remove(): void };
type Rewriter = {
  on(
    selector: string,
    handlers: { element(el: RewriterElement): void; text?(chunk: { text: string }): void },
  ): Rewriter;
  transform(response: Response): Response;
};
declare const HTMLRewriter: new () => Rewriter;

// How long the head's end waits on the api before closing with the shell's own tags. A crawler's budget, not a
// person's, who has the head already: measured from outside Western Europe, a cold api took 0.3 to 0.9 s for its one
// D1 read, so a shorter wait would cost those crawlers their preview.
export const SHARE_CARD_TIMEOUT_MS = 1500;

// What a named preview says under the document's name.
export const SHARE_PITCH =
  'Open it in LiveDoc: diagrams, whiteboards and documents, made together.';

// A preview line is one line: a name with newlines or runs of spaces would wrap oddly in every chat app.
const NAME_MAX = 200;

export function isSharePagePath(pathname: string): boolean {
  return /^\/(?:document|diagram)\/shared\/?$/.test(pathname);
}

type ShareHead = { title: string; description: string; image: string; imageAlt: string };

export function shareHead(name: string, code: string, origin: string): ShareHead {
  const title = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Untitled document';
  return {
    title,
    description: SHARE_PITCH,
    image: `${origin}/api${shareCardImagePath(code)}`,
    imageAlt: `${title}, drawn in LiveDoc`,
  };
}

// The name the api lets this link's preview show, or null for every other answer.
async function sharePreviewName(
  api: Fetcher,
  request: Request,
  origin: string,
  code: string,
): Promise<string | null> {
  const headers = new Headers();
  // The api limits previews per visitor; without this it would see the live worker as one caller.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip);
  try {
    const res = await api.fetch(`${origin}/api${sharePreviewCardPath(code)}`, {
      headers,
      signal: AbortSignal.timeout(SHARE_CARD_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn('[share-page] api answered', res.status);
      return null;
    }
    const body = (await res.json()) as Partial<SharePreviewResponse>;
    return typeof body.name === 'string' ? body.name : null;
  } catch (err) {
    console.warn('[share-page] api unreachable', String(err));
    return null;
  }
}

// The tags a preview reads, in the order the root layout (app/layout.tsx) emits them, and which of a share
// head's values each one carries. The title is the first of them.
const PREVIEW_META = [
  ['name', 'description', 'description'],
  ['property', 'og:title', 'title'],
  ['property', 'og:description', 'description'],
  ['property', 'og:image', 'image'],
  ['property', 'og:image:alt', 'imageAlt'],
  ['name', 'twitter:title', 'title'],
  ['name', 'twitter:description', 'description'],
  ['name', 'twitter:image', 'image'],
] as const satisfies readonly (readonly ['name' | 'property', string, keyof ShareHead])[];

type PreviewMeta = (typeof PREVIEW_META)[number];

// The shell's own title and preview tags, as written in it: the runtime hands attribute values and text over raw,
// entities and all, so they go back out unchanged.
type ShellTags = { title: string | null; meta: { tag: PreviewMeta; content: string }[] };

const metaHtml = ([attr, key]: PreviewMeta, content: string) =>
  `<meta ${attr}="${key}" content="${content}"/>`;

function shellTagsHtml(tags: ShellTags): string {
  const title = tags.title === null ? '' : `<title>${tags.title}</title>`;
  return title + tags.meta.map(({ tag, content }) => metaHtml(tag, content)).join('');
}

// The same tags, naming the document: every one the shell had, none it did not.
function shareTagsHtml(tags: ShellTags, head: ShareHead): string {
  const title = tags.title === null ? '' : `<title>${xmlEscape(head.title)}</title>`;
  return title + tags.meta.map(({ tag }) => metaHtml(tag, xmlEscape(head[tag[2]]))).join('');
}

// The shell without its title and preview tags, and those tags as it had them.
async function takePreviewTags(html: string): Promise<{ html: string; tags: ShellTags }> {
  const tags: ShellTags = { title: null, meta: [] };
  const found = new Map<PreviewMeta, string>();
  let rewriter = new HTMLRewriter().on('title', {
    element: (el) => {
      tags.title = '';
      el.remove();
    },
    text: (chunk) => void (tags.title += chunk.text),
  });
  for (const tag of PREVIEW_META) {
    rewriter = rewriter.on(`meta[${tag[0]}="${tag[1]}"]`, {
      element: (el) => {
        found.set(tag, el.getAttribute('content') ?? '');
        el.remove();
      },
    });
  }
  const stripped = await rewriter.transform(new Response(html)).text();
  for (const tag of PREVIEW_META) {
    const content = found.get(tag);
    if (content !== undefined) tags.meta.push({ tag, content });
  }
  return { html: stripped, tags };
}

// Write the page as it becomes known: the head up to its end now, the tags and the body once `rest` resolves.
async function writeInTwoParts(
  writable: WritableStream<Uint8Array>,
  first: string,
  rest: Promise<string>,
): Promise<void> {
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  try {
    await writer.write(encoder.encode(first));
    await writer.write(encoder.encode(await rest));
    await writer.close();
  } catch (err) {
    // The visitor went away mid-page; nothing is left to send them.
    console.warn('[share-page] visitor left before the page ended', String(err));
  }
}

// The share page: the shell, its head sent at once and closed with the document's name when the api allows it.
// `shell` is the placeholder request the editor route serves for every document address.
export async function sharePage(
  request: Request,
  api: Fetcher | undefined,
  shell: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('s');
  if (!api || !code || request.method !== 'GET') return shell();
  // Asked first, so the api works while the shell is fetched and its head is sent.
  const name = sharePreviewName(api, request, url.origin, code);
  const page = await shell();
  if (!page.ok) return page;
  const built = await page.text();
  const { html, tags } = await takePreviewTags(built);
  const end = html.indexOf('</head>');
  if (end === -1) {
    console.warn('[share-page] shell has no head to close');
    return new Response(built, page);
  }
  const closing = name.then(
    (found) =>
      (found === null
        ? shellTagsHtml(tags)
        : shareTagsHtml(tags, shareHead(found, code, url.origin))) + html.slice(end),
  );
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  void writeInTwoParts(writable, html.slice(0, end), closing);
  // The body is no longer the shell's bytes, so its length goes; every other header stays.
  const headers = new Headers(page.headers);
  headers.delete('content-length');
  return new Response(readable, { status: page.status, statusText: page.statusText, headers });
}
