import { describe, expect, it } from 'vitest';
import { ODF_NS } from '../odf/odf-namespaces';
import { parseXml, type XmlParsed } from '../xml/xml-tree';
import {
  odfMetaChildren,
  ooxmlAppXml,
  ooxmlCoreXml,
  readOdfMeta,
  readOoxmlMetadata,
  statisticsOf,
} from './metadata';

const parse = (xml: string): XmlParsed => {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('fixture');
  return parsed;
};

const ODF_ROOT = `xmlns:office="${ODF_NS.office}" xmlns:meta="${ODF_NS.meta}" xmlns:dc="${ODF_NS.dc}"`;

// docs/specs/020-import-export/office-packages.md "Common pieces": metadata.
describe('ODF metadata', () => {
  const meta = parse(
    `<office:document-meta ${ODF_ROOT}><office:meta><meta:generator>X</meta:generator><dc:title>T</dc:title><meta:initial-creator>A</meta:initial-creator><dc:creator>B</dc:creator><meta:creation-date>2026-01-01T00:00:00</meta:creation-date><dc:date>2026-01-02T00:00:00</dc:date><dc:language>en-GB</dc:language><meta:keyword>k</meta:keyword><meta:document-statistic meta:word-count="9"/></office:meta></office:document-meta>`,
  );

  it('reads the mapped fields and keeps the rest, leaving out what is written fresh', () => {
    expect(readOdfMeta(meta)).toEqual({
      title: 'T',
      author: 'A',
      lastModifiedBy: 'B',
      created: '2026-01-01T00:00:00',
      modified: '2026-01-02T00:00:00',
      language: 'en-GB',
      kept: { meta: [{ xml: '<meta:keyword>k</meta:keyword>', ns: { meta: ODF_NS.meta } }] },
    });
    expect(readOdfMeta(parse(`<office:document-meta ${ODF_ROOT}/>`))).toEqual({});
  });

  it('writes the generator, the fields, fresh statistics and the kept children', () => {
    const written = odfMetaChildren(readOdfMeta(meta), statisticsOf(['a b', 'c']), 'LiveDoc', {
      meta: ODF_NS.meta,
    });
    expect(written).toBe(
      '<meta:generator>LiveDoc</meta:generator><dc:title>T</dc:title><meta:initial-creator>A</meta:initial-creator><dc:creator>B</dc:creator><meta:creation-date>2026-01-01T00:00:00</meta:creation-date><dc:date>2026-01-02T00:00:00</dc:date><dc:language>en-GB</dc:language><meta:document-statistic meta:paragraph-count="2" meta:word-count="3" meta:character-count="4"/><meta:keyword>k</meta:keyword>',
    );
    const reread = readOdfMeta(
      parse(
        `<office:document-meta ${ODF_ROOT}><office:meta>${written}</office:meta></office:document-meta>`,
      ),
    );
    expect(reread).toEqual(readOdfMeta(meta));
  });
});

describe('OOXML metadata', () => {
  const core = parse(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>T &amp; U</dc:title><dc:creator>A</dc:creator><cp:lastModifiedBy>B</cp:lastModifiedBy><cp:revision>3</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>`,
  );
  const app = parse(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Template>Normal.dotm</Template><Pages>2</Pages><Words>9</Words><Application>Microsoft Office Word</Application></Properties>`,
  );

  it('reads core and extended properties, keeping what is not written fresh', () => {
    expect(readOoxmlMetadata(core, app)).toEqual({
      title: 'T & U',
      author: 'A',
      lastModifiedBy: 'B',
      created: '2026-01-01T00:00:00Z',
      kept: {
        meta: [
          {
            xml: '<cp:revision>3</cp:revision>',
            ns: { cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties' },
          },
        ],
        app: [
          {
            xml: '<Template>Normal.dotm</Template>',
            ns: { '': 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties' },
          },
        ],
      },
    });
    expect(readOoxmlMetadata(undefined, undefined)).toEqual({});
  });

  it('writes core and extended properties that read back equal', () => {
    const metadata = readOoxmlMetadata(core, app);
    const coreXml = ooxmlCoreXml(metadata);
    const appXml = ooxmlAppXml(metadata, statisticsOf(['a']), 'LiveDoc');
    expect(coreXml).toContain(
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>',
    );
    expect(appXml).toContain('<Application>LiveDoc</Application><Words>1</Words>');
    expect(readOoxmlMetadata(parse(coreXml), parse(appXml))).toEqual(metadata);
  });
});
