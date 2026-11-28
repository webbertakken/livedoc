import { describe, expect, it } from 'vitest';
import { base64OfBytes, bytesOfBase64 } from './base64';

describe('base64', () => {
  it('round-trips bytes, large ones included', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    expect(bytesOfBase64(base64OfBytes(bytes))).toEqual(bytes);
  });

  it('answers null for text that is not base64', () => {
    expect(bytesOfBase64('***')).toBeNull();
  });
});
