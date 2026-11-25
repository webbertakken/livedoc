import { describe, expect, it } from 'vitest';
import { PdfDate } from './pdf-date';

describe('PdfDate', () => {
  it('writes a time as the file holds a date, in UTC', () => {
    expect(PdfDate.write(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('D:20260102030405Z');
  });

  it('reads back what it writes', () => {
    const at = Date.UTC(2026, 10, 21, 14, 2, 3);
    expect(PdfDate.read(PdfDate.write(at))).toBe(at);
  });

  it('reads a date with its offset from UTC, as the standard writes it', () => {
    expect(PdfDate.read("D:20261121150203+01'00'")).toBe(Date.UTC(2026, 10, 21, 14, 2, 3));
    expect(PdfDate.read("D:20261121090203-05'00")).toBe(Date.UTC(2026, 10, 21, 14, 2, 3));
  });

  it('reads a date cut short, the rest its first, and one without its D:', () => {
    expect(PdfDate.read('D:2026')).toBe(Date.UTC(2026, 0, 1));
    expect(PdfDate.read('20261121')).toBe(Date.UTC(2026, 10, 21));
  });

  it('reads none from what is no date', () => {
    for (const text of ['', 'D:', 'yesterday', 'D:20261341', 'D:2026112125', 'D:-2026'])
      expect(PdfDate.read(text)).toBeNull();
  });
});
