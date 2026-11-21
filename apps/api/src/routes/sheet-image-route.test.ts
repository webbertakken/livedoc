// IMAGE's pictures through the api (docs/specs/029-sheets/imports.md "IMAGE", "The api's guards"): the imports' gates,
// the picture answered as its bytes with the type its first bytes show, refusals for what is no picture or is kept on
// drive.google.com, the hour's cache, the per-spreadsheet rate and the guarded fetch's failures.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';
import { IMAGE_BYTES_MAX } from './sheet-image-route';

let kit: WorkbookKit;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

// The web the Worker sees: DNS over HTTPS and a few addresses, counting the pictures fetched.
let fetches = 0;
function stubWeb(): void {
  fetches = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname === 'cloudflare-dns.com')
      return Response.json({
        Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [],
      });
    fetches++;
    if (url.pathname === '/a.png')
      // A server naming the wrong type: the bytes decide.
      return new Response(PNG, { headers: { 'content-type': 'text/html' } });
    if (url.pathname === '/a.svg')
      return new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } });
    if (url.pathname === '/huge.png') return new Response(new Uint8Array(IMAGE_BYTES_MAX + 1));
    return new Response('', { status: 404 });
  });
}

// The Workers cache, as a map of bytes and types.
function stubCache(): void {
  const held = new Map<string, { bytes: ArrayBuffer; type: string }>();
  vi.stubGlobal('caches', {
    default: {
      match: async (req: Request) => {
        const hit = held.get(req.url);
        return hit ? new Response(hit.bytes, { headers: { 'content-type': hit.type } }) : undefined;
      },
      put: async (req: Request, res: Response) =>
        void held.set(req.url, {
          bytes: await res.arrayBuffer(),
          type: res.headers.get('content-type')!,
        }),
    },
  });
}

const env = () => kit.sql.env as unknown as Record<string, unknown>;
const picture = (url: string, extra: { owner?: string; code?: string } = {}) =>
  kit.call({
    method: 'GET',
    path: `/book1/workbook/imports?${new URLSearchParams({ kind: 'image', url }).toString()}`,
    ...extra,
  });
const allow = () => kit.call({ method: 'POST', path: '/book1/workbook/imports' });

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);",
  );
  env().SHEET_IMPORTS = 'on';
  stubWeb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a picture IMAGE shows', () => {
  it('waits for Allow Access, then answers its bytes to every reader, typed by them', async () => {
    expect((await picture('https://a.example/a.png')).status).toBe(403);
    await allow();
    const res = await picture('https://a.example/a.png', { owner: 'v', code: 'VIEW' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('refuses an SVG, a missing or too large picture, drive.google.com and no address', async () => {
    await allow();
    for (const url of [
      'https://a.example/a.svg',
      'https://a.example/gone.png',
      'https://a.example/huge.png',
      'https://drive.google.com/uc?id=1',
    ]) {
      const res = await picture(url);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'image_refused' });
    }
    expect((await picture('ftp://a.example/a.png')).status).toBe(400);
    const noAddress = await kit.call({ method: 'GET', path: '/book1/workbook/imports?kind=image' });
    expect(noAddress.status).toBe(400);
  });

  it('keeps a picture an hour for everyone', async () => {
    stubCache();
    await allow();
    await picture('https://a.example/a.png');
    const again = await picture('https://a.example/a.png', { owner: 'v', code: 'VIEW' });
    expect(fetches).toBe(1);
    expect(again.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(PNG);
  });

  it('holds each spreadsheet to its rate', async () => {
    await allow();
    let calls = 0;
    env().SHEET_IMPORT_RATE_LIMITER = {
      limit: async ({ key }: { key: string }) => {
        expect(key).toBe('sheet-import:book1');
        return { success: ++calls < 2 };
      },
    };
    expect((await picture('https://a.example/a.png')).status).toBe(200);
    expect((await picture('https://a.example/a.png')).status).toBe(429);
  });
});
