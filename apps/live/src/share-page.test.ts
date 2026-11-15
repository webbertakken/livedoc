import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';
import {
  SHARE_CARD_TIMEOUT_MS,
  SHARE_PITCH,
  isSharePagePath,
  shareHead,
  type Fetcher,
} from './share-page';

// The share page's head (docs/specs/013-workspace/share-link-previews.md "The share page's head"): a working share
// link previews with its document's name and card; anything else is the shell as built.

// HTMLRewriter is a Workers runtime global. This stand-in does what the share page asks of it, on the shell below:
// `title` and `meta[name="..."]` / `meta[property="..."]` selectors, an element's attributes (raw, entities and
// all, as the runtime answers them), its removal, and a title's text.
type Handlers = {
  element?(el: { getAttribute(name: string): string | null; remove(): void }): void;
  text?(chunk: { text: string }): void;
};
class StubRewriter {
  handlers: [string, Handlers][] = [];
  on(selector: string, handlers: Handlers) {
    this.handlers.push([selector, handlers]);
    return this;
  }
  transform(response: Response): Response {
    const rewrite = async () => {
      let html = await response.text();
      for (const [selector, handlers] of this.handlers) {
        const meta = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
        const pattern = meta
          ? new RegExp(`<meta ${meta[1]}="${meta[2]}"[^>]*>`, 'g')
          : /<title>([^<]*)<\/title>/g;
        html = html.replace(pattern, (tag: string, inner?: string) => {
          let removed = false;
          handlers.element?.({
            getAttribute: (name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? null,
            remove: () => void (removed = true),
          });
          if (!meta) handlers.text?.({ text: inner ?? '' });
          return removed ? '' : tag;
        });
      }
      return html;
    };
    const body = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        controller.enqueue(new TextEncoder().encode(await rewrite()));
        controller.close();
      },
    });
    return new Response(body, { status: response.status, headers: response.headers });
  }
}

// What the root layout emits, in its order: scripts and styles first, then the title and the preview tags, then the
// inline scripts that must run before any chunk does.
const HEAD_START =
  '<html><head><link rel="stylesheet" href="/a.css"/><script src="/a.js" async=""></script>';
const PREVIEW_TAGS =
  '<title>LiveDoc</title>' +
  '<meta name="description" content="Diagrams &amp; more"/>' +
  '<meta property="og:title" content="LiveDoc"/>' +
  '<meta property="og:description" content="Diagrams &amp; more"/>' +
  '<meta property="og:image" content="https://docs.nu/opengraph-image"/>' +
  '<meta property="og:image:width" content="1200"/>' +
  '<meta property="og:image:alt" content="LiveDoc, a card"/>' +
  '<meta name="twitter:title" content="LiveDoc"/>' +
  '<meta name="twitter:description" content="Diagrams &amp; more"/>' +
  '<meta name="twitter:image" content="https://docs.nu/twitter-image"/>';
const HEAD_END = '<script>guard()</script></head><body>editor</body></html>';
const SHELL = HEAD_START + PREVIEW_TAGS + HEAD_END;
// The head before its preview tags: everything but the title and the tags it moves (og:image:width stays).
const HEAD_WITHOUT_TAGS =
  HEAD_START + '<meta property="og:image:width" content="1200"/><script>guard()</script>';
// The shell's own title and tags, closing the head: what goes out when the link does not preview.
const AS_BUILT =
  HEAD_WITHOUT_TAGS +
  '<title>LiveDoc</title>' +
  '<meta name="description" content="Diagrams &amp; more"/>' +
  '<meta property="og:title" content="LiveDoc"/>' +
  '<meta property="og:description" content="Diagrams &amp; more"/>' +
  '<meta property="og:image" content="https://docs.nu/opengraph-image"/>' +
  '<meta property="og:image:alt" content="LiveDoc, a card"/>' +
  '<meta name="twitter:title" content="LiveDoc"/>' +
  '<meta name="twitter:description" content="Diagrams &amp; more"/>' +
  '<meta name="twitter:image" content="https://docs.nu/twitter-image"/>' +
  '</head><body>editor</body></html>';

function makeEnv(
  api?: (path: string, init?: RequestInit) => Promise<Response> | Response,
  shellStatus = 200,
  shellBody = SHELL,
) {
  const assets: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (req: Request) => {
        assets.push(new URL(req.url).pathname);
        return new Response(shellBody, {
          status: shellStatus,
          headers: { 'content-type': 'text/html' },
        });
      },
    },
    ...(api
      ? {
          API: {
            fetch: async (input, init) =>
              api(new URL(typeof input === 'string' ? input : input.url).pathname, init),
          } satisfies Fetcher,
        }
      : {}),
  };
  return { env: env as never, assets };
}

const get = (path: string, env: never, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://docs.nu${path}`, init), env);

beforeEach(() => {
  vi.stubGlobal('HTMLRewriter', StubRewriter);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isSharePagePath', () => {
  it('is the share page, with or without its slash, and its legacy address', () => {
    expect(isSharePagePath('/document/shared')).toBe(true);
    expect(isSharePagePath('/document/shared/')).toBe(true);
    expect(isSharePagePath('/diagram/shared')).toBe(true);
    expect(isSharePagePath('/document/abc')).toBe(false);
    expect(isSharePagePath('/document/shared/x')).toBe(false);
  });
});

describe('shareHead', () => {
  it('names the document and points at its share card on this origin', () => {
    expect(shareHead('Payments flow', 'Ab 12', 'https://rebrand.preview.docs.nu')).toEqual({
      title: 'Payments flow',
      description: SHARE_PITCH,
      image: 'https://rebrand.preview.docs.nu/api/share/Ab%2012/image.png',
      imageAlt: 'Payments flow, drawn in LiveDoc',
    });
  });

  it('keeps a preview to one tidy line, and never blank', () => {
    expect(shareHead('  Q3\n\n  plan  ', 'c', 'https://x').title).toBe('Q3 plan');
    expect(shareHead('x'.repeat(500), 'c', 'https://x').title).toHaveLength(200);
    expect(shareHead('   ', 'c', 'https://x').title).toBe('Untitled document');
  });
});

describe('live worker: the share page', () => {
  it("closes the shell's head with the document the link names, asking the api once", async () => {
    const seen: string[] = [];
    const { env, assets } = makeEnv((path) => {
      seen.push(path);
      return Response.json({ name: 'Q3 <plan> & "risks"' });
    });
    const res = await get('/document/shared?s=CODE1234', env);
    expect(assets).toEqual(['/document/placeholder']);
    expect(res.status).toBe(200);
    // Still the editor page's headers, less a length the rewritten body no longer has.
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.has('content-length')).toBe(false);
    const name = 'Q3 &lt;plan&gt; &amp; &quot;risks&quot;';
    const image = 'https://docs.nu/api/share/CODE1234/image.png';
    const pitch = SHARE_PITCH;
    const page = await res.text();
    expect(seen).toEqual(['/api/share/CODE1234/card']);
    expect(page).toBe(
      HEAD_WITHOUT_TAGS +
        `<title>${name}</title>` +
        `<meta name="description" content="${pitch}"/>` +
        `<meta property="og:title" content="${name}"/>` +
        `<meta property="og:description" content="${pitch}"/>` +
        `<meta property="og:image" content="${image}"/>` +
        `<meta property="og:image:alt" content="${name}, drawn in LiveDoc"/>` +
        `<meta name="twitter:title" content="${name}"/>` +
        `<meta name="twitter:description" content="${pitch}"/>` +
        `<meta name="twitter:image" content="${image}"/>` +
        '</head><body>editor</body></html>',
    );
  });

  it('sends the head, every style and script in it, before the api answers', async () => {
    let answer!: (res: Response) => void;
    const { env } = makeEnv(() => new Promise<Response>((resolve) => (answer = resolve)));
    const res = await get('/document/shared?s=CODE1234', env);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let sent = '';
    while (sent.length < HEAD_WITHOUT_TAGS.length) sent += (await reader.read()).value;
    expect(sent).toBe(HEAD_WITHOUT_TAGS);

    answer(Response.json({ name: 'Payments flow' }));
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += chunk.value;
    expect(rest).toMatch(/^<title>Payments flow<\/title>.*<\/head><body>editor<\/body><\/html>$/);
  });

  it('asks the api only once the head is on its way', async () => {
    const api = vi.fn(() => Response.json({ name: 'Payments flow' }));
    const { env } = makeEnv(api);
    const res = await get('/document/shared?s=CODE1234', env);
    expect(api).not.toHaveBeenCalled();
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let sent = '';
    while (sent.length < HEAD_WITHOUT_TAGS.length) sent += (await reader.read()).value;
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += chunk.value;
    expect(api).toHaveBeenCalledOnce();
    expect(rest).toContain('<title>Payments flow</title>');
  });

  it("forwards the visitor's address, so the api limits previews per visitor", async () => {
    let init: RequestInit | undefined;
    const { env } = makeEnv((_, i) => {
      init = i;
      return Response.json({ name: 'n' });
    });
    await (
      await get('/document/shared?s=C', env, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })
    ).text();
    expect(new Headers(init!.headers).get('CF-Connecting-IP')).toBe('203.0.113.9');
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    await (await get('/document/shared?s=C', env)).text();
    expect(new Headers(init!.headers).has('CF-Connecting-IP')).toBe(false);
  });

  it("closes the head with the shell's own tags when the api says the link previews as LiveDoc", async () => {
    const { env } = makeEnv(() => Response.json({ error: 'not_found' }, { status: 404 }));
    const res = await get('/document/shared?s=GATED', env);
    expect(await res.text()).toBe(AS_BUILT);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("closes the head with the shell's own tags, and says so, when the api fails or cannot be reached", async () => {
    const failing = makeEnv(() => new Response('boom', { status: 500 }));
    expect(await (await get('/document/shared?s=C', failing.env)).text()).toBe(AS_BUILT);
    expect(console.warn).toHaveBeenCalledWith('[share-page] api answered', 500);

    const down = makeEnv(() => Promise.reject(new Error('timeout')));
    expect(await (await get('/document/shared?s=C', down.env)).text()).toBe(AS_BUILT);
    expect(console.warn).toHaveBeenCalledWith('[share-page] api unreachable', 'Error: timeout');
  });

  it('ignores an answer with no name in it', async () => {
    const { env } = makeEnv(() => Response.json({}));
    expect(await (await get('/document/shared?s=C', env)).text()).toBe(AS_BUILT);
  });

  it('waits on the api no longer than its budget', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { env } = makeEnv(() => Response.json({ name: 'n' }));
    await (await get('/document/shared?s=C', env)).text();
    expect(timeout).toHaveBeenCalledWith(SHARE_CARD_TIMEOUT_MS);
  });

  it('asks nothing without a code, a GET, or an api binding', async () => {
    const api = vi.fn(() => Response.json({ name: 'n' }));
    const { env } = makeEnv(api);
    expect(await (await get('/document/shared', env)).text()).toBe(SHELL);
    expect((await get('/document/shared?s=C', env, { method: 'HEAD' })).status).toBe(200);
    expect(api).not.toHaveBeenCalled();

    const unbound = makeEnv();
    const res = await get('/document/shared?s=C', unbound.env);
    expect(unbound.assets).toEqual(['/document/placeholder']);
    expect(await res.text()).toBe(SHELL);
  });

  it('leaves a failed shell alone', async () => {
    const { env } = makeEnv(() => Response.json({ name: 'n' }), 503);
    const res = await get('/document/shared?s=C', env);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(SHELL);
  });

  it('sends a shell with no head to close as built, and says so', async () => {
    const headless = '<html><body>editor</body></html>';
    const { env } = makeEnv(() => Response.json({ name: 'n' }), 200, headless);
    expect(await (await get('/document/shared?s=C', env)).text()).toBe(headless);
    expect(console.warn).toHaveBeenCalledWith('[share-page] shell has no head to close');
  });

  it("never asks about a document's own address, which only its owner can open", async () => {
    const api = vi.fn(() => Response.json({ name: 'n' }));
    const { env } = makeEnv(api);
    expect(await (await get('/document/abc?s=C', env)).text()).toBe(SHELL);
    expect(api).not.toHaveBeenCalled();
  });
});
