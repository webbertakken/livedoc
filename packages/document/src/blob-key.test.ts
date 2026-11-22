import { describe, expect, it } from 'vitest';
import { blobKeyOf, isBlobKey } from './blob-key';

describe('blob key', () => {
  it('is the SHA-256 of the bytes in lower-case hex', async () => {
    const key = await blobKeyOf(new TextEncoder().encode('abc'));
    expect(key).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(isBlobKey(key)).toBe(true);
  });

  it('is the same for equal bytes and differs for others', async () => {
    const one = await blobKeyOf(new Uint8Array([1, 2, 3]));
    expect(await blobKeyOf(new Uint8Array([1, 2, 3]))).toBe(one);
    expect(await blobKeyOf(new Uint8Array([1, 2, 4]))).not.toBe(one);
  });

  it('refuses what is not 64 lower-case hex characters', () => {
    for (const value of [
      '',
      'abc',
      'A'.repeat(64),
      'g'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
      7,
      null,
    ])
      expect(isBlobKey(value)).toBe(false);
  });
});
