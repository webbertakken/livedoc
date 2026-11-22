// docs/specs/006-document/blob-store.md "Where the bytes live", "Getting bytes out".
import { describe, expect, it, vi } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { byteRangeOf, readBlob, storeBlob } from './blob-store';
import { testFilesBucket } from './test-files-bucket';

const bytes = Uint8Array.from(new TextEncoder().encode('%PDF-1.7 twenty bytes'));
const stream = (value: Uint8Array) => new Blob([value.slice()]).stream();
const textOf = async (body: ReadableStream | null) => (body ? new Response(body).text() : null);

describe('the blob store', () => {
  it('stores bytes as the object it is told, checked against their key', async () => {
    const bucket = testFilesBucket();
    const key = await blobKeyOf(bytes);
    expect(await storeBlob(bucket, `ada/${key}`, key, stream(bytes))).toBe('stored');
    expect(bucket.objects.get(`ada/${key}`)).toEqual(bytes);
  });

  // "The store checks the key against the bytes as they are stored": refused, and nothing is kept.
  it('refuses bytes that do not hash to their key, keeping nothing', async () => {
    const bucket = testFilesBucket();
    const other = await blobKeyOf(Uint8Array.of(1, 2, 3));
    expect(await storeBlob(bucket, `ada/${other}`, other, stream(bytes))).toBe('key_mismatch');
    expect(bucket.objects.size).toBe(0);
  });

  it('names a failure of object storage apart from a mismatch', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bucket = testFilesBucket();
    bucket.failPuts = true;
    const key = await blobKeyOf(bytes);
    expect(await storeBlob(bucket, `ada/${key}`, key, stream(bytes))).toBe('store_failed');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('reads an object whole or one range of it, and nothing for an object that is gone', async () => {
    const bucket = testFilesBucket();
    const key = await blobKeyOf(bytes);
    await storeBlob(bucket, 'an/object', key, stream(bytes));
    expect(await textOf(await readBlob(bucket, 'an/object', null))).toBe('%PDF-1.7 twenty bytes');
    expect(await textOf(await readBlob(bucket, 'an/object', { offset: 1, length: 3 }))).toBe('PDF');
    expect(await readBlob(bucket, 'another/object', null)).toBeNull();
  });
});

// "By range": a Range request is answered with exactly the bytes asked for.
describe('byteRangeOf', () => {
  it.each([
    ['bytes=0-4', { offset: 0, length: 5 }],
    ['bytes=5-', { offset: 5, length: 15 }],
    ['bytes=-6', { offset: 14, length: 6 }],
    ['bytes=-999', { offset: 0, length: 20 }],
    ['bytes=10-999', { offset: 10, length: 10 }],
    [' bytes=19-19 ', { offset: 19, length: 1 }],
  ])('reads %s of 20 bytes', (header, range) => {
    expect(byteRangeOf(header, 20)).toEqual(range);
  });

  it.each(['bytes=20-', 'bytes=99-100', 'bytes=-0', 'bytes=99999999999999999999-'])(
    'answers %s of 20 bytes as past the end',
    (header) => {
      expect(byteRangeOf(header, 20)).toBe('unsatisfiable');
    },
  );

  it.each([null, '', 'bytes=-', 'bytes=4-2', 'items=0-4', 'bytes=0-1,5-6', 'bytes=a-b'])(
    'ignores %j, as a server may',
    (header) => {
      expect(byteRangeOf(header, 20)).toBeNull();
    },
  );
});
