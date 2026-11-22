import { describe, expect, it } from 'vitest';
import { PDF_SNIFF_BYTES } from './limits';
import { isPdfBytes } from './sniff';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('isPdfBytes', () => {
  it('finds the marker at the start', () => {
    expect(isPdfBytes(ascii('%PDF-1.7\n'))).toBe(true);
  });

  it('finds the marker after leading junk, as readers do', () => {
    expect(isPdfBytes(ascii(`${'\n'.repeat(900)}%PDF-2.0`))).toBe(true);
  });

  it('finds a marker that ends exactly at the last byte looked at', () => {
    expect(isPdfBytes(ascii(`${' '.repeat(PDF_SNIFF_BYTES - 5)}%PDF-`))).toBe(true);
  });

  it('ignores a marker past the bytes looked at', () => {
    expect(isPdfBytes(ascii(`${' '.repeat(PDF_SNIFF_BYTES - 4)}%PDF-1.7`))).toBe(false);
  });

  it('refuses other bytes, whatever they are named', () => {
    expect(isPdfBytes(ascii('PK\u0003\u0004 not a pdf'))).toBe(false);
    expect(isPdfBytes(new Uint8Array())).toBe(false);
    expect(isPdfBytes(ascii('%PDF'))).toBe(false);
  });
});
