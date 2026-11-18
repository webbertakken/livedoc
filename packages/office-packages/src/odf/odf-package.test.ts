import { describe, expect, it } from 'vitest';
import { writeZip as writeTestZip } from '../zip/zip-writer-fixture';
import { isSafeEntryName } from './entry-names';
import { looksLikeXml, odfManifest, readOdfPackage, writeOdfPackage } from './odf-package';
import { ODF_MEDIA_TYPES } from './odf-namespaces';

const TEXT = ODF_MEDIA_TYPES.text;
const xml = (s: string) => new TextEncoder().encode(s);
const MANIFEST_NS = 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';

// docs/specs/020-import-export/office-packages.md "Writing a package".
describe('writeOdfPackage', () => {
  it('writes mimetype first and stored, then the manifest, then the entries', async () => {
    const bytes = writeOdfPackage(TEXT, [
      { name: 'content.xml', mediaType: 'text/xml', data: xml('<x/>') },
    ]);
    // The mimetype's name and bytes sit right after the first local header, uncompressed.
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    expect(new TextDecoder().decode(bytes.subarray(38, 38 + TEXT.length))).toBe(TEXT);
    const read = await readOdfPackage(bytes);
    expect(read.ok && [...read.package.entries.keys()]).toEqual([
      'mimetype',
      'META-INF/manifest.xml',
      'content.xml',
    ]);
    expect(read.ok && read.package.mediaType).toBe(TEXT);
  });

  it('gives the same bytes for the same entries', () => {
    const entries = [{ name: 'content.xml', mediaType: 'text/xml', data: xml('<x/>') }];
    expect(writeOdfPackage(TEXT, entries)).toEqual(writeOdfPackage(TEXT, entries));
  });

  it('lists the root and every entry in the manifest', () => {
    const manifest = odfManifest(TEXT, [{ name: 'a&b.xml', mediaType: 'text/xml', data: xml('') }]);
    expect(manifest).toContain('manifest:full-path="/" manifest:media-type="' + TEXT + '"');
    expect(manifest).toContain('manifest:full-path="a&amp;b.xml"');
  });
});

// docs/specs/020-import-export/office-packages.md "Reading a package".
describe('readOdfPackage', () => {
  it('refuses bytes that are not a zip', async () => {
    expect(await readOdfPackage(xml('hello'))).toEqual({ ok: false, rejection: 'package_damaged' });
    const truncated = writeTestZip([{ name: 'mimetype', data: TEXT }]).slice(0, 40);
    expect(await readOdfPackage(truncated)).toMatchObject({ rejection: 'package_damaged' });
  });

  it('refuses an entry whose bytes are damaged', async () => {
    const zip = writeTestZip([{ name: 'content.xml', data: 'x' }]);
    // The central directory names a compression method no reader knows.
    const view = new DataView(zip.buffer);
    const central = zip.findIndex((_, i) => view.getUint32(i, true) === 0x02014b50);
    view.setUint16(central + 10, 99, true);
    expect(await readOdfPackage(zip)).toMatchObject({
      rejection: 'package_damaged',
      entry: 'content.xml',
    });
  });

  it('refuses entry names that would be paths', async () => {
    for (const name of ['../x', '/x', 'a\\b', 'C:x', 'a/../../b', ''])
      expect(isSafeEntryName(name)).toBe(false);
    expect(isSafeEntryName('Pictures/a.png')).toBe(true);
    const bad = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: '../evil', data: 'x' },
    ]);
    expect(await readOdfPackage(bad)).toMatchObject({
      rejection: 'package_damaged',
      entry: '../evil',
    });
  });

  it('refuses an encrypted entry or a manifest that encrypts', async () => {
    const flagged = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: 'content.xml', data: 'x', encrypted: true },
    ]);
    expect(await readOdfPackage(flagged)).toMatchObject({ rejection: 'package_encrypted' });
    const manifest = `<manifest:manifest xmlns:manifest="${MANIFEST_NS}"><manifest:file-entry manifest:full-path="content.xml"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>`;
    const encrypted = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: 'META-INF/manifest.xml', data: manifest },
    ]);
    expect(await readOdfPackage(encrypted)).toMatchObject({ rejection: 'package_encrypted' });
  });

  it('drops scripts, macros, signatures and thumbnails, and reports them', async () => {
    const bytes = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: 'Basic/Standard/Module1.xml', data: 'x' },
      { name: 'Scripts/python/a.py', data: 'x' },
      { name: 'META-INF/documentsignatures.xml', data: 'x' },
      { name: 'Thumbnails/thumbnail.png', data: 'x' },
      { name: 'Pictures/', data: '' },
    ]);
    const read = await readOdfPackage(bytes);
    expect(read.ok && read.package.dropped).toHaveLength(4);
    expect(read.ok && [...read.package.entries.keys()]).toEqual(['mimetype']);
  });

  it('reads the media type from the manifest when there is no mimetype entry', async () => {
    const manifest = `<manifest:manifest xmlns:manifest="${MANIFEST_NS}"><manifest:file-entry manifest:full-path="/" manifest:media-type="${TEXT}"/></manifest:manifest>`;
    const read = await readOdfPackage(
      writeTestZip([{ name: 'META-INF/manifest.xml', data: manifest }]),
    );
    expect(read.ok && read.package.mediaType).toBe(TEXT);
    const rootless = `<manifest:manifest xmlns:manifest="${MANIFEST_NS}"/>`;
    const noRoot = await readOdfPackage(
      writeTestZip([{ name: 'META-INF/manifest.xml', data: rootless }]),
    );
    expect(noRoot).toMatchObject({ rejection: 'package_damaged', entry: 'mimetype' });
    const none = await readOdfPackage(writeTestZip([{ name: 'content.xml', data: '<x/>' }]));
    expect(none).toMatchObject({ rejection: 'package_damaged', entry: 'mimetype' });
    const broken = await readOdfPackage(
      writeTestZip([{ name: 'META-INF/manifest.xml', data: '<m' }]),
    );
    expect(broken).toMatchObject({ rejection: 'xml_malformed' });
  });

  it('refuses a package past a byte, entry or inflate budget', async () => {
    const small = { bytes: 10_000, inflatedBytes: 1000, entries: 3 };
    const bomb = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: 'content.xml', data: new Uint8Array(2000), method: 'deflate' },
    ]);
    expect(await readOdfPackage(bomb, small)).toMatchObject({
      rejection: 'package_too_large',
      entry: 'content.xml',
    });
    const many = writeTestZip(['a', 'b', 'c', 'd'].map((name) => ({ name, data: 'x' })));
    expect(await readOdfPackage(many, small)).toEqual({
      ok: false,
      rejection: 'package_too_large',
    });
    const stored = writeTestZip([{ name: 'mimetype', data: new Uint8Array(1001) }]);
    expect(await readOdfPackage(stored, small)).toMatchObject({
      rejection: 'package_too_large',
      entry: 'mimetype',
    });
    const big = writeTestZip([{ name: 'mimetype', data: new Uint8Array(10_001) }]);
    expect(await readOdfPackage(big, small)).toEqual({ ok: false, rejection: 'package_too_large' });
  });

  it('tells a flat file from a package by its first bytes', () => {
    expect(looksLikeXml(xml('\uFEFF  <?xml version="1.0"?>'))).toBe(true);
    expect(looksLikeXml(xml('<office:document/>'))).toBe(true);
    expect(looksLikeXml(xml('PK\u0003\u0004'))).toBe(false);
  });
});
