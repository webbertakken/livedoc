// docs/specs/006-document/blob-store.md "Getting bytes in", "Getting bytes out": the doors as the editor calls them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { ApiError } from './core';
import {
  apiBeginBlobUpload,
  apiCompleteBlobUpload,
  apiHoldsBlob,
  apiReadBlob,
  apiStoreBlob,
  apiStoreBlobPart,
} from './files';

const KEY = 'a'.repeat(64) as BlobKey;
const BYTES = Uint8Array.of(1, 2, 3);

type Call = { url: string; method: string; body: unknown };
function answering(body: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
      const text = body instanceof Uint8Array ? body : JSON.stringify(body);
      return new Response(text as BodyInit, { status });
    }),
  );
  return calls;
}
const pathOf = (call: Call | undefined): string => call!.url.replace(/^.*\/api\//, '/');

afterEach(() => vi.unstubAllGlobals());

describe('the blob store’s doors', () => {
  it('asks whether bytes are held, of the caller or of a document’s owner', async () => {
    const calls = answering({ held: true });
    expect(await apiHoldsBlob('ada', KEY)).toBe(true);
    expect(await apiHoldsBlob('ada', KEY, { documentId: 'doc 1', shareCode: 'CODE' })).toBe(true);
    expect(calls.map(pathOf)).toEqual([`/files/${KEY}`, `/files/${KEY}?document=doc%201`]);
  });

  it('stores bytes in one request', async () => {
    const calls = answering({ stored: true }, 201);
    await apiStoreBlob('ada', KEY, BYTES, { documentId: 'D', shareCode: null });
    expect(calls).toEqual([
      { url: expect.stringContaining(`/files/${KEY}?document=D`), method: 'PUT', body: BYTES },
    ]);
  });

  it('begins an upload in parts, sends a part, and completes', async () => {
    const begun = { upload: 'u 1', partBytes: 8, parts: [1] };
    let calls = answering(begun, 201);
    expect(await apiBeginBlobUpload('ada', KEY, 20, { documentId: 'D', shareCode: null })).toEqual(
      begun,
    );
    expect(pathOf(calls[0])).toBe(`/files/${KEY}/uploads?size=20&document=D`);
    expect(calls[0]!.method).toBe('POST');

    calls = answering({ parts: [1, 2] });
    expect(await apiStoreBlobPart('ada', KEY, 'u 1', 2, BYTES)).toEqual([1, 2]);
    expect(pathOf(calls[0])).toBe(`/files/${KEY}/uploads/u%201/parts/2`);
    expect(calls[0]).toMatchObject({ method: 'PUT', body: BYTES });

    calls = answering({ stored: true }, 201);
    await apiCompleteBlobUpload('ada', KEY, 'u 1', { documentId: 'D', shareCode: null });
    expect(pathOf(calls[0])).toBe(`/files/${KEY}/uploads/u%201/complete?document=D`);
    expect(calls[0]!.method).toBe('POST');
  });

  it('tells a refusal by its name', async () => {
    answering({ error: 'usage_exceeded', leftBytes: 4 }, 403);
    const refused = await apiBeginBlobUpload('ada', KEY, 20).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).code).toBe('usage_exceeded');
  });

  it('reads a blob a document holds, whole', async () => {
    const calls = answering(BYTES);
    const scope = { ownerId: 'ada', documentId: 'D', shareCode: null };
    expect(await apiReadBlob(scope, KEY)).toEqual(BYTES);
    expect(pathOf(calls[0])).toBe(`/documents/D/files/${KEY}`);
  });
});
