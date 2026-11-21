// docs/specs/020-import-export/office-packages.md "Reading a package" steps 1 and 4: which kind of package the bytes are.
import { describe, expect, it } from 'vitest';
import { packageKind } from './package-kind';
import { writeZip } from './zip/zip-writer-fixture';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('packageKind', () => {
  it('knows a flat file, an OOXML container, an OLE file and an ODF package', () => {
    expect(packageKind(bytes('<?xml version="1.0"?><office:document/>'))).toBe('flat');
    expect(packageKind(writeZip([{ name: '[Content_Types].xml', data: bytes('<Types/>') }]))).toBe(
      'ooxml',
    );
    expect(packageKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(
      'ooxml',
    );
    expect(packageKind(writeZip([{ name: 'mimetype', data: bytes('x') }]))).toBe('odf');
  });

  it('leaves what is neither, or a broken zip, to the ODF reader to refuse', () => {
    expect(packageKind(new Uint8Array([1, 2, 3]))).toBe('odf');
    expect(packageKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe('odf');
  });
});
