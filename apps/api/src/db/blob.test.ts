// The room's BLOB columns: bytes bound and read back as either SQLite answers them.
import { describe, expect, it } from 'vitest';
import { fromBlob, toBlob } from './blob';

describe('toBlob and fromBlob', () => {
  it('binds a copy of just the bytes and reads either answer back', () => {
    const bytes = new Uint8Array([9, 1, 2, 3]).subarray(1);
    const blob = toBlob(bytes);
    expect(blob.byteLength).toBe(3);
    expect(fromBlob(blob)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fromBlob(new Uint8Array([1, 2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
  });
});
