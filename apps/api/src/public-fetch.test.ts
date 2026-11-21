// The guarded fetch of a public page (docs/specs/029-sheets/imports.md "The api's guards"): hosts resolved to public
// addresses only, redirects followed by hand and checked, its own ports, size and time bounded, text decoded.
import { describe, expect, it, vi } from 'vitest';
import {
  fetchPublicPage,
  isBlockedHost,
  resolvesPublic,
  type PublicFetchOptions,
} from './public-fetch';

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

// A web of its own: DNS over HTTPS answers from `dns`, every other address from `pages`.
const hrefOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

function web(dns: Record<string, string[]>, pages: Record<string, Route>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(hrefOf(input));
    if (url.hostname === 'cloudflare-dns.com') {
      const name = url.searchParams.get('name')!;
      const type = url.searchParams.get('type') === 'A' ? 1 : 28;
      const answers = (dns[name] ?? []).filter((ip) => (type === 1) === !ip.includes(':'));
      if (name === 'dns-down.example') return new Response('', { status: 503 });
      if (name === 'nxdomain.example') return Response.json({ Status: 3 });
      return Response.json({
        Answer: [{ type: 5, data: 'cname.' }, ...answers.map((data) => ({ type, data }))],
      });
    }
    const page = pages[url.href];
    return page ? page(url, init) : new Response('missing', { status: 404 });
  };
}

const opts = (
  fetcher: typeof fetch,
  extra: Partial<PublicFetchOptions> = {},
): PublicFetchOptions => ({
  fetcher,
  timeoutMs: 1_000,
  maxBytes: 64,
  maxRedirects: 2,
  userAgent: 'test',
  accept: '*/*',
  ...extra,
});

const DNS = { 'a.example': ['93.184.216.34', '2606:2800::1'], 'b.example': ['93.184.216.35'] };

describe('isBlockedHost at its edges', () => {
  it('refuses no host, and lets a public IPv4-mapped address through', () => {
    expect(isBlockedHost('')).toBe(true);
    expect(isBlockedHost('[]')).toBe(true);
    expect(isBlockedHost('::ffff:5db8:d822')).toBe(false);
    expect(isBlockedHost('::ffff:93.184.216.34')).toBe(false);
    expect(isBlockedHost('::ffff:example')).toBe(false);
  });
});

describe('resolvesPublic', () => {
  it('needs every address of a name public, and at least one', async () => {
    const f = web(
      { ...DNS, 'mixed.example': ['93.184.216.34', '10.0.0.1'], 'v6.example': ['fd00::1'] },
      {},
    );
    expect(await resolvesPublic('a.example', f)).toBe(true);
    expect(await resolvesPublic('mixed.example', f)).toBe(false);
    expect(await resolvesPublic('v6.example', f)).toBe(false);
    expect(await resolvesPublic('none.example', f)).toBe(false);
    expect(await resolvesPublic('nxdomain.example', f)).toBe(false);
    expect(await resolvesPublic('dns-down.example', f)).toBe(false);
  });

  it('checks an IP literal as it stands', async () => {
    const f = vi.fn();
    expect(await resolvesPublic('93.184.216.34', f)).toBe(true);
    expect(await resolvesPublic('127.0.0.1', f)).toBe(false);
    expect(await resolvesPublic('[::1]', f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('fetchPublicPage', () => {
  it('fetches a public page, sending no credential, and decodes it in its charset', async () => {
    const seen: RequestInit[] = [];
    const f = web(DNS, {
      'https://a.example/': (_, init) => {
        seen.push(init!);
        return new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), {
          headers: { 'content-type': 'text/plain; charset=ISO-8859-1' },
        });
      },
    });
    expect(await fetchPublicPage('https://a.example/', opts(f))).toEqual({
      ok: true,
      text: 'café',
      type: 'text/plain; charset=ISO-8859-1',
      url: 'https://a.example/',
    });
    expect(seen[0]!.redirect).toBe('manual');
    expect(seen[0]!.headers).toEqual({ 'User-Agent': 'test', Accept: '*/*' });
  });

  it('reads an unknown charset as UTF-8, and a page with no body as empty', async () => {
    const f = web(DNS, {
      'https://a.example/x': () =>
        new Response('é', { headers: { 'content-type': 'text/plain; charset=nope' } }),
      'https://a.example/y': () => new Response(null, { status: 200 }),
    });
    expect(await fetchPublicPage('https://a.example/x', opts(f))).toMatchObject({ text: 'é' });
    expect(await fetchPublicPage('https://a.example/y', opts(f))).toMatchObject({
      text: '',
      type: '',
    });
  });

  it('follows redirects by hand, checking each address', async () => {
    const to = (location: string) => () =>
      new Response(null, { status: 302, headers: { location } });
    const f = web(
      { ...DNS, 'evil.example': ['169.254.169.254'] },
      {
        'https://a.example/1': to('/2'),
        'https://a.example/2': to('https://b.example/3'),
        'https://b.example/3': () => new Response('end'),
        'https://a.example/private': to('http://127.0.0.1/admin'),
        'https://a.example/rebind': to('https://evil.example/'),
        'https://a.example/loop': to('/loop'),
        'https://a.example/nowhere': () => new Response(null, { status: 301 }),
      },
    );
    expect(await fetchPublicPage('https://a.example/1', opts(f))).toMatchObject({
      ok: true,
      text: 'end',
      url: 'https://b.example/3',
    });
    expect(await fetchPublicPage('https://a.example/private', opts(f))).toEqual({
      ok: false,
      reason: 'address_refused',
    });
    expect(await fetchPublicPage('https://a.example/rebind', opts(f))).toEqual({
      ok: false,
      reason: 'host_refused',
    });
    expect(await fetchPublicPage('https://a.example/loop', opts(f))).toEqual({
      ok: false,
      reason: 'too_many_redirects',
    });
    expect(await fetchPublicPage('https://a.example/nowhere', opts(f))).toEqual({
      ok: false,
      reason: 'status_301',
    });
  });

  it.each([
    ['ftp://a.example/', 'address_refused'],
    ['https://a.example:8443/', 'address_refused'],
    ['http://localhost/', 'address_refused'],
    ['https://unknown.example/', 'host_refused'],
    ['https://a.example/missing', 'status_404'],
  ])('refuses %s: %s', async (url, reason) => {
    expect(await fetchPublicPage(url, opts(web(DNS, {})))).toEqual({ ok: false, reason });
  });

  it('stops reading past its size', async () => {
    const f = web(DNS, { 'https://a.example/big': () => new Response('x'.repeat(65)) });
    expect(await fetchPublicPage('https://a.example/big', opts(f))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('gives up past its time, and names a network failure', async () => {
    const slow = web(DNS, {
      'https://a.example/slow': (_, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
      'https://a.example/down': () => Promise.reject(new TypeError('connection refused')),
    });
    expect(await fetchPublicPage('https://a.example/slow', opts(slow, { timeoutMs: 5 }))).toEqual({
      ok: false,
      reason: 'timeout',
    });
    expect(await fetchPublicPage('https://a.example/down', opts(slow))).toEqual({
      ok: false,
      reason: 'network:TypeError',
    });
  });

  it('uses the Worker’s own fetch when given none', async () => {
    vi.stubGlobal('fetch', web(DNS, { 'https://a.example/': () => new Response('own') }));
    try {
      const { fetcher: _, ...rest } = opts(vi.fn());
      expect(await fetchPublicPage('https://a.example/', rest)).toMatchObject({ text: 'own' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
