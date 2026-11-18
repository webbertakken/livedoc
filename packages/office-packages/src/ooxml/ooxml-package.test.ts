import { describe, expect, it } from 'vitest';
import { listZip } from '../zip/zip-reader';
import { writeZip as writeTestZip } from '../zip/zip-writer-fixture';
import { OOXML_CONTENT_TYPES, RELATIONSHIP_TYPES, transitionalType } from './ooxml-namespaces';
import {
  readOoxmlPackage,
  relationshipPartOf,
  relationshipsXml,
  resolvePartName,
  writeOoxmlPackage,
} from './ooxml-package';

const TYPES = (overrides = '') =>
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${OOXML_CONTENT_TYPES.relationships}"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="${OOXML_CONTENT_TYPES.document}"/>${overrides}</Types>`;
const RELS = (rels: string) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
const MAIN = `<Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.officeDocument}" Target="word/document.xml"/>`;

const docx = (entries: { name: string; data: string | Uint8Array }[]) =>
  writeTestZip([
    { name: '[Content_Types].xml', data: TYPES() },
    { name: '_rels/.rels', data: RELS(MAIN) },
    { name: 'word/document.xml', data: '<w:document xmlns:w="urn:w"/>' },
    ...entries,
  ]);

// docs/specs/020-import-export/office-packages.md "Reading a package".
describe('readOoxmlPackage', () => {
  it('reads the main part, content types and relationships', async () => {
    const read = await readOoxmlPackage(
      docx([
        {
          name: 'word/_rels/document.xml.rels',
          data: RELS(
            `<Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.image}" Target="media/a.png"/><Relationship Id="rId3" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="https://example.com" TargetMode="External"/>`,
          ),
        },
        { name: 'word/media/a.png', data: new Uint8Array([1, 2]) },
        { name: 'word/odd.bin', data: new Uint8Array([3]) },
      ]),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const p = read.package;
    expect(p.mainPart).toBe('word/document.xml');
    expect(p.mediaType).toBe(OOXML_CONTENT_TYPES.document);
    expect(p.contentTypes.get('word/media/a.png')).toBe('image/png');
    expect(p.contentTypes.get('word/odd.bin')).toBe('application/octet-stream');
    expect(p.defaults.get('png')).toBe('image/png');
    expect(p.relationships.get('word/document.xml')).toHaveLength(2);
    expect(p.external).toEqual([
      {
        id: 'rId3',
        type: RELATIONSHIP_TYPES.hyperlink,
        target: 'https://example.com',
        external: true,
      },
    ]);
    expect([...p.parts.keys()]).not.toContain('[Content_Types].xml');
  });

  it('drops macros, ActiveX, signatures, thumbnails and OLE binaries, with the relationships naming them', async () => {
    const read = await readOoxmlPackage(
      docx([
        {
          name: 'word/_rels/document.xml.rels',
          data: RELS(
            `<Relationship Id="rId9" Type="${RELATIONSHIP_TYPES.vbaProject}" Target="vbaProject.bin"/><Relationship Id="rId8" Type="${RELATIONSHIP_TYPES.oleObject}" Target="embeddings/oleObject1.bin"/>`,
          ),
        },
        { name: 'word/vbaProject.bin', data: 'x' },
        { name: 'word/_rels/vbaProject.bin.rels', data: RELS('') },
        { name: 'word/vbaData.xml', data: '<x/>' },
        { name: 'word/activeX/activeX1.xml', data: '<x/>' },
        { name: '_xmlsignatures/sig1.xml', data: '<x/>' },
        { name: 'docProps/thumbnail.jpeg', data: 'x' },
        { name: 'word/embeddings/oleObject1.bin', data: 'x' },
      ]),
    );
    expect(read.ok && read.package.dropped).toEqual([
      'word/vbaProject.bin',
      'word/_rels/vbaProject.bin.rels',
      'word/vbaData.xml',
      'word/activeX/activeX1.xml',
      '_xmlsignatures/sig1.xml',
      'docProps/thumbnail.jpeg',
      'word/embeddings/oleObject1.bin',
    ]);
    expect(read.ok && read.package.relationships.get('word/document.xml')).toEqual([]);
  });

  it('reads Strict relationship types as Transitional ones', async () => {
    const strict = `<Relationship Id="rId1" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="/word/document.xml"/>`;
    const read = await readOoxmlPackage(
      writeTestZip([
        { name: '[Content_Types].xml', data: TYPES() },
        { name: '_rels/.rels', data: RELS(strict) },
        { name: 'word/document.xml', data: '<x/>' },
      ]),
    );
    expect(read.ok && read.package.mainPart).toBe('word/document.xml');
    expect(transitionalType('urn:other')).toBe('urn:other');
  });

  it('refuses an encrypted file, another OLE file, a missing main part or content types', async () => {
    const ole = (extra: number[]) =>
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...extra]);
    const info = [...'EncryptionInfo'].flatMap((c) => [c.charCodeAt(0), 0]);
    expect(await readOoxmlPackage(ole([0, ...info]))).toMatchObject({
      rejection: 'package_encrypted',
    });
    expect(await readOoxmlPackage(ole([0, 69, 0]))).toMatchObject({
      rejection: 'package_wrong_type',
    });
    const noMain = writeTestZip([
      { name: '[Content_Types].xml', data: TYPES() },
      { name: '_rels/.rels', data: RELS('') },
    ]);
    expect(await readOoxmlPackage(noMain)).toMatchObject({
      rejection: 'package_damaged',
      entry: '_rels/.rels',
    });
    const noTypes = writeTestZip([{ name: '_rels/.rels', data: RELS(MAIN) }]);
    expect(await readOoxmlPackage(noTypes)).toMatchObject({ entry: '[Content_Types].xml' });
    expect(await readOoxmlPackage(new Uint8Array(8))).toMatchObject({
      rejection: 'package_damaged',
    });
  });

  it('refuses a relationship whose target leaves the package, and malformed XML', async () => {
    const escape = RELS(
      `<Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.image}" Target="../../../etc/passwd"/>`,
    );
    expect(
      await readOoxmlPackage(docx([{ name: 'word/_rels/document.xml.rels', data: escape }])),
    ).toMatchObject({ rejection: 'package_damaged', entry: 'word/_rels/document.xml.rels' });
    expect(
      await readOoxmlPackage(docx([{ name: 'word/_rels/document.xml.rels', data: '<x' }])),
    ).toMatchObject({ rejection: 'xml_malformed' });
    const badTypes = writeTestZip([{ name: '[Content_Types].xml', data: '<!DOCTYPE x><x/>' }]);
    expect(await readOoxmlPackage(badTypes)).toMatchObject({ rejection: 'xml_doctype_refused' });
  });

  it('refuses a picture bomb by its header', async () => {
    const bomb = new Uint8Array(24);
    bomb.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bomb.buffer).setUint32(16, 50_000);
    new DataView(bomb.buffer).setUint32(20, 50_000);
    expect(
      await readOoxmlPackage(docx([{ name: 'word/media/bomb.png', data: bomb }])),
    ).toMatchObject({
      rejection: 'picture_too_large',
      entry: 'word/media/bomb.png',
    });
  });
});

describe('part names', () => {
  it('resolves targets against the source folder, refusing escapes', () => {
    expect(resolvePartName('word/document.xml', 'media/a.png')).toBe('word/media/a.png');
    expect(resolvePartName('word/document.xml', '../customXml/item1.xml')).toBe(
      'customXml/item1.xml',
    );
    expect(resolvePartName('word/document.xml', '/word/x.xml')).toBe('word/x.xml');
    expect(resolvePartName('word/document.xml', './media/a%20b.png')).toBe('word/media/a b.png');
    expect(resolvePartName('word/document.xml', '../../x')).toBeUndefined();
    expect(resolvePartName('', '%E0%A4%A')).toBeUndefined();
    expect(resolvePartName('', '/')).toBeUndefined();
  });

  it('names the relationship part of a part', () => {
    expect(relationshipPartOf('word/document.xml')).toBe('word/_rels/document.xml.rels');
    expect(relationshipPartOf('')).toBe('_rels/.rels');
  });
});

// docs/specs/020-import-export/office-packages.md "Writing a package".
describe('writeOoxmlPackage', () => {
  const parts = [
    {
      name: 'word/document.xml',
      contentType: OOXML_CONTENT_TYPES.document,
      data: new TextEncoder().encode('<x/>'),
    },
    { name: 'word/media/a.png', contentType: 'image/png', data: new Uint8Array([1]) },
    {
      name: 'word/settings.xml',
      contentType: OOXML_CONTENT_TYPES.settings,
      data: new TextEncoder().encode('<s/>'),
    },
  ];
  const rels = new Map([
    ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'word/document.xml' }]],
    [
      'word/document.xml',
      [
        { id: 'rId2', type: RELATIONSHIP_TYPES.image, target: 'media/a.png' },
        {
          id: 'rId3',
          type: RELATIONSHIP_TYPES.hyperlink,
          target: 'https://x.test/?a&b',
          external: true,
        },
      ],
    ],
  ]);

  it('writes content types first, then the package relationships, then each part with its own', async () => {
    const bytes = writeOoxmlPackage(parts, rels, new Map([['png', 'image/png']]));
    const read = await readOoxmlPackage(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.package.contentTypes.get('word/media/a.png')).toBe('image/png');
    expect(read.package.relationships.get('word/document.xml')).toEqual(
      rels.get('word/document.xml'),
    );
    const listed = listZip(bytes);
    expect(listed.ok && listed.entries.map((e) => e.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/media/a.png',
      'word/settings.xml',
    ]);
  });

  it('gives the same bytes for the same parts', () => {
    expect(writeOoxmlPackage(parts, rels)).toEqual(writeOoxmlPackage(parts, rels));
  });

  it('writes relationships with attributes in a fixed order, escaped', () => {
    expect(relationshipsXml([{ id: 'r', type: 't', target: 'a&b', external: true }])).toContain(
      '<Relationship Id="r" Type="t" Target="a&amp;b" TargetMode="External"/>',
    );
  });
});
