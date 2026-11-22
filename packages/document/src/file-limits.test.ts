// docs/specs/006-document/blob-store.md "Getting bytes in" (parts of FILE_PART_BYTES), "Limits".
import { describe, expect, it } from 'vitest';
import {
  FILE_PART_BYTES,
  FILE_SINGLE_UPLOAD_MAX_BYTES,
  FILE_TAB_MAX_BYTES,
  filePartCount,
  filePartSize,
} from './file-limits';

describe('a file in parts', () => {
  // "12 parts for 100 MB"
  it('travels in twelve parts at the cap', () => {
    expect(filePartCount(FILE_TAB_MAX_BYTES)).toBe(12);
    expect(filePartCount(FILE_PART_BYTES)).toBe(1);
    expect(filePartCount(FILE_PART_BYTES + 1)).toBe(2);
    expect(filePartCount(1)).toBe(1);
  });

  it('has every part whole but the last, which is what is left', () => {
    const size = FILE_PART_BYTES * 2 + 5;
    expect([1, 2, 3].map((n) => filePartSize(size, n))).toEqual([
      FILE_PART_BYTES,
      FILE_PART_BYTES,
      5,
    ]);
    expect(filePartSize(FILE_PART_BYTES, 1)).toBe(FILE_PART_BYTES);
    expect(filePartSize(7, 1)).toBe(7);
  });

  it('is asked for only past what one request takes, and a part is over object storage’s least', () => {
    expect(FILE_SINGLE_UPLOAD_MAX_BYTES).toBeGreaterThan(FILE_PART_BYTES);
    expect(FILE_PART_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
});
