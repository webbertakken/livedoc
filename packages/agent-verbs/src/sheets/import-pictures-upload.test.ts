// docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Stored on opening" (D628): an agent's import
// uploads each picture to the caller's gallery as it is; one past the gallery's 10 MB is not sent, and the gallery's
// refusal is said as the read names a picture left out.
import { MAX_IMAGE_BYTES } from '@livedoc/api-schema';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../testing/fake-api';
import { galleryPictureStore, uploadRefusalOf } from './import-pictures-upload';

const picture = {
  data: new Uint8Array([1, 2, 3]),
  type: 'image/png' as const,
  natural: { width: 30, height: 20 },
};

describe('galleryPictureStore', () => {
  it('uploads the bytes with their type and pixels, taking the gallery’s image id', async () => {
    const seen: Request[] = [];
    const api = fakeApi({
      '/images': async (r: Request) => {
        seen.push(r.clone());
        return Response.json({ image: { id: 'g-9' }, deduped: false });
      },
    });
    const store = galleryPictureStore(api, { 'X-Livedoc-Client': 'cli' }, () => {});
    expect(await store(picture)).toEqual({ ok: true, imageId: 'g-9' });
    const [r] = seen;
    expect(r!.method).toBe('POST');
    expect(r!.headers.get('Content-Type')).toBe('image/png');
    expect([r!.headers.get('X-Image-Width'), r!.headers.get('X-Image-Height')]).toEqual([
      '30',
      '20',
    ]);
    expect(r!.headers.get('X-Livedoc-Client')).toBe('cli');
    expect(new Uint8Array(await r!.arrayBuffer())).toEqual(picture.data);
  });

  it('sends no picture past the gallery’s 10 MB, and names a refusal, each logged', async () => {
    const api = fakeApi({
      '/images': () => Response.json({ error: 'gallery_full' }, { status: 403 }),
    });
    const logs: string[] = [];
    const store = galleryPictureStore(api, {}, (event, data) =>
      logs.push(`${event} ${String(data.why)}`),
    );
    const big = { ...picture, data: new Uint8Array(MAX_IMAGE_BYTES + 1) };
    expect(await store(big)).toEqual({ ok: false, why: 'too_large' });
    expect(api.calls).toEqual([]);
    expect(await store(picture)).toEqual({ ok: false, why: 'gallery_full' });
    expect(logs).toEqual([
      '[workbook] picture not stored too_large',
      '[workbook] picture not stored gallery_full',
    ]);
  });
});

describe('uploadRefusalOf', () => {
  const refusal = async (response: Response) => {
    const api = fakeApi({ '/images': () => response });
    return api.json('/images', { method: 'POST' }).catch((e: unknown) => uploadRefusalOf(e));
  };

  it.each([
    [Response.json({ error: 'file_too_large' }, { status: 413 }), 'too_large'],
    [Response.json({ error: 'unsupported_type' }, { status: 415 }), 'unreadable'],
    [Response.json({ error: 'malformed_jpeg' }, { status: 415 }), 'unreadable'],
    [Response.json({ error: 'images_unavailable' }, { status: 503 }), 'unavailable'],
    [new Response('down', { status: 503 }), 'unavailable'],
    [new Response('oops', { status: 500 }), 'failed'],
  ])('names a refusal by its code or status (%#)', async (response, why) => {
    expect(await refusal(response)).toBe(why);
  });

  it('names anything not from the api as failed', () => {
    expect(uploadRefusalOf(new TypeError('network'))).toBe('failed');
  });
});
