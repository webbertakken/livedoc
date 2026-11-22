// docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's thumbnail": its two doors, as the editor
// calls them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './core';
import { apiPdfThumbnailWanted, apiSendPdfThumbnail } from './pdf-documents';

function stub(response: () => Promise<Response>) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

const scope = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: 'code-1' };
const pathOf = (fetch: ReturnType<typeof stub>) =>
  new URL(String(fetch.mock.calls[0]![0]), 'https://x.test').pathname;

describe('apiPdfThumbnailWanted', () => {
  it.each([
    [{ wanted: true }, true],
    [{ wanted: false }, false],
    [{}, false],
    [{ wanted: 'yes' }, false],
  ])('answers %j as %s, never from a kept answer', async (body, wanted) => {
    const fetch = stub(async () => Response.json(body));
    expect(await apiPdfThumbnailWanted(scope)).toBe(wanted);
    expect(pathOf(fetch)).toBe('/api/documents/D/pdf-documents/t1/thumbnail');
    expect(fetch.mock.calls[0]![1]?.cache).toBe('no-store');
  });

  it('rejects when the question is refused', async () => {
    stub(async () => Response.json({ error: 'pdf_not_found' }, { status: 404 }));
    await expect(apiPdfThumbnailWanted(scope)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiSendPdfThumbnail', () => {
  it('puts the JPEG’s bytes, as a JPEG', async () => {
    const fetch = stub(async () => new Response(null, { status: 204 }));
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
    await apiSendPdfThumbnail(scope, jpeg);
    expect(pathOf(fetch)).toBe('/api/documents/D/pdf-documents/t1/thumbnail');
    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(jpeg);
  });

  it('rejects with the refusal’s name', async () => {
    stub(async () => Response.json({ error: 'level_too_low' }, { status: 403 }));
    await expect(apiSendPdfThumbnail(scope, new Uint8Array(1))).rejects.toMatchObject({
      code: 'level_too_low',
    });
  });
});
