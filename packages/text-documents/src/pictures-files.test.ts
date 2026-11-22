// docs/specs/034-text-documents/objects.md "The model" and "In the formats": a picture in line is held whole when it
// holds only what the model maps (size, crop, alternative text, title, decorative), else kept as the file has it; its
// bytes are the document's media by the SHA-256 of their bytes, written back at the entry they arrived in, else under a
// name of their key; an entry kept content still names stays kept and is written once; conversion carries pictures.
import { readOdfPackage, readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { base64OfBytes } from './base64';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile, type ReadLimits } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Inline } from './model/blocks';
import { Pictures, type Picture } from './model/pictures';
import type { TextDocument } from './model/text-document';
import { modelOf } from './testing/compare';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, odt, W_P } from './testing/packages';
import { BLUE_PNG, BLUE_PNG_SHA, GREEN_PNG, GREEN_PNG_SHA, solidPng } from './testing/pictures';

const decoder = new TextDecoder();
const read = async (bytes: Uint8Array, limits?: ReadLimits) => {
  const r = await readTextDocumentFile(bytes, limits);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};
const inlinesOf = (document: TextDocument): Inline[] =>
  document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
const picturesOf = (document: TextDocument) =>
  inlinesOf(document).filter((i): i is Picture => i.type === 'picture');
const keptNames = (document: TextDocument) =>
  inlinesOf(document).flatMap((i) => (i.type === 'kept' ? [i.name] : []));

// Word's inline picture, as Word writes one.
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DML = [
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');
const ADEC =
  '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>';
type WordPicture = {
  docPr?: string;
  docPrChildren?: string;
  blip?: string;
  blipFill?: string;
  spPr?: string;
  xfrm?: string;
  anchor?: boolean;
  embed?: string;
};
const wordPicture = ({
  docPr = 'descr="A cat" title="Tom"',
  docPrChildren = '',
  blip = '',
  blipFill = '<a:srcRect l="10000" t="20000" r="5000"/><a:stretch><a:fillRect/></a:stretch>',
  spPr = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
  xfrm = '',
  anchor = false,
  embed = 'r:embed="rId5"',
}: WordPicture = {}) => {
  const tag = anchor ? 'wp:anchor' : 'wp:inline';
  const anchorExtra = anchor
    ? '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    : '';
  const anchorAttrs = anchor
    ? ' simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"'
    : '';
  return `<w:r><w:drawing><${tag} distT="0" distB="0" distL="0" distR="0"${anchorAttrs} ${DML}>${anchorExtra}<wp:extent cx="1238250" cy="876300"/><wp:effectExtent l="19050" t="0" r="0" b="0"/>${anchor ? '<wp:wrapNone/>' : ''}<wp:docPr id="2" name="Bild 2" ${docPr}>${docPrChildren}</wp:docPr><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="5" name="Picture 4"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip ${embed} cstate="print">${blip}</a:blip>${blipFill}</pic:blipFill><pic:spPr><a:xfrm${xfrm}><a:off x="0" y="0"/><a:ext cx="1238250" cy="876300"/></a:xfrm>${spPr}</pic:spPr></pic:pic></a:graphicData></a:graphic></${tag}></w:drawing></w:r>`;
};
const IMAGE_REL = (id: string, target: string) =>
  `<Relationship Id="${id}" Type="${RELATIONSHIP_TYPES.image}" Target="${target}"/>`;
const wordDocx = (runs: string, { bytes = GREEN_PNG, name = 'media/image2.png' } = {}) =>
  docx(W_P(runs).replace('<w:p>', `<w:p ${R_NS}>`), {
    rels: IMAGE_REL('rId5', name),
    entries: [{ name: `word/${name}`, data: bytes }],
  });

// LibreOffice's picture in line, as it writes one (soffice 24.2, from Word's above).
const ODF_STYLE_NS = [
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ');
const LO_GRAPHIC = (extra = '') =>
  `<style:style style:name="fr2" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties fo:margin-left="0in" fo:margin-right="0in" fo:margin-top="0in" fo:margin-bottom="0in" fo:background-color="transparent" draw:fill="none" draw:fill-color="#ffffff" fo:padding="0in" fo:border="none" style:mirror="none" fo:clip="rect(0.1917in, 0.0681in, 0in, 0.1354in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard" loext:decorative="true"${extra}/></style:style>`;
const LO_FRAME = ({
  anchor = 'as-char',
  attrs = '',
  image = '<draw:image xlink:href="Pictures/10000000000000820000005CDC6B3555.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/>',
  children = '<svg:title>Tom</svg:title><svg:desc>A cat</svg:desc>',
} = {}) =>
  `<draw:frame draw:style-name="fr2" draw:name="Bild 2" text:anchor-type="${anchor}" svg:width="1.3543in" svg:height="0.9583in" draw:z-index="0"${attrs}>${image}${children}</draw:frame>`;
const loOdt = (frames: string, graphic = LO_GRAPHIC(), bytes = GREEN_PNG) =>
  odt('', {
    content: `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" ${ODF_STYLE_NS} office:version="1.4"><office:automatic-styles>${graphic}</office:automatic-styles><office:body><office:text><text:p>${frames}</text:p></office:text></office:body></office:document-content>`,
    entries: [{ name: 'Pictures/10000000000000820000005CDC6B3555.png', data: bytes }],
  });

const TOM: Omit<Picture, 'width' | 'height' | 'crop'> = {
  type: 'picture',
  media: GREEN_PNG_SHA,
  alt: 'A cat',
  title: 'Tom',
  props: {},
};

describe('a picture read from a file', () => {
  it("reads Word's picture in line: size, crop, alternative text, title, decorative", async () => {
    const document = await read(wordDocx(wordPicture({ docPrChildren: ADEC })));
    expect(picturesOf(document)).toEqual([
      {
        ...TOM,
        width: 97.5,
        height: 69,
        decorative: true,
        crop: { top: 0.2, right: 0.05, bottom: 0, left: 0.1 },
      },
    ]);
    expect(document.media).toEqual({
      [GREEN_PNG_SHA]: { mediaType: 'image/png', bytes: GREEN_PNG, part: 'word/media/image2.png' },
    });
    // Its entry and relationship are the model's now, no longer kept.
    const source = document.source?.format === 'ooxml' ? document.source : undefined;
    expect(source?.parts.map((p) => p.name)).not.toContain('word/media/image2.png');
    expect(source?.relationships.get('word/document.xml') ?? []).toEqual([]);
  });

  it("reads LibreOffice's picture in line, its crop from the picture's own size", async () => {
    const document = await read(loOdt(LO_FRAME()));
    expect(picturesOf(document)).toEqual([
      {
        ...TOM,
        width: 97.51,
        height: 68.998,
        decorative: true,
        crop: { top: 0.2, right: 0.0503, bottom: 0, left: 0.1 },
      },
    ]);
    expect(document.media?.[GREEN_PNG_SHA]?.part).toBe(
      'Pictures/10000000000000820000005CDC6B3555.png',
    );
    const source = document.source?.format === 'odf' ? document.source : undefined;
    expect(source?.entries.map((e) => e.name)).toEqual([]);
  });

  it('reads a crop at the resolution the picture gives', async () => {
    // 130 × 92 pixels at 192 an inch: 48.75 × 34.5 pt.
    const png = new Uint8Array([
      ...GREEN_PNG.subarray(0, 33),
      ...[0, 0, 0, 9, 0x70, 0x48, 0x59, 0x73, 0, 0, 0x1d, 0x87, 0, 0, 0x1d, 0x87, 1, 0, 0, 0, 0],
      ...GREEN_PNG.subarray(33),
    ]);
    const graphic = LO_GRAPHIC().replace(
      'rect(0.1917in, 0.0681in, 0in, 0.1354in)',
      'rect(6.9pt, 0pt, 0pt, 4.875pt)',
    );
    const [picture] = picturesOf(await read(loOdt(LO_FRAME(), graphic, png)));
    expect(picture?.crop).toEqual({ top: 0.2, right: 0, bottom: 0, left: 0.1 });
  });

  it("reads a flat file's picture from its base64", async () => {
    const image = `<draw:image><office:binary-data>${base64OfBytes(GREEN_PNG).replace(/(.{76})/g, '$1\n')}</office:binary-data></draw:image>`;
    const document = await read(
      fodt(
        `<text:p><draw:frame text:anchor-type="as-char" svg:width="10pt" svg:height="5pt" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0">${image}</draw:frame></text:p>`,
      ),
    );
    expect(picturesOf(document)).toEqual([
      { type: 'picture', media: GREEN_PNG_SHA, width: 10, height: 5, props: {} },
    ]);
    expect(document.media?.[GREEN_PNG_SHA]).toEqual({ mediaType: 'image/png', bytes: GREEN_PNG });
  });

  it("refuses a flat file whose picture's header claims too many pixels", async () => {
    const bomb = base64OfBytes(solidPng(1, 1, [0, 0, 0]).fill(0x4e, 16, 24));
    const r = await readTextDocumentFile(
      fodt(
        `<text:p><draw:frame text:anchor-type="as-char" svg:width="10pt" svg:height="5pt" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"><draw:image><office:binary-data>${bomb}</office:binary-data></draw:image></draw:frame></text:p>`,
      ),
    );
    expect(r).toMatchObject({ ok: false, rejection: 'picture_too_large' });
  });

  it('holds one media for two pictures of the same bytes', async () => {
    const document = await read(
      docx(
        W_P(wordPicture() + wordPicture({ embed: 'r:embed="rId6"' })).replace(
          '<w:p>',
          `<w:p ${R_NS}>`,
        ),
        {
          rels: IMAGE_REL('rId5', 'media/image1.png') + IMAGE_REL('rId6', 'media/image2.png'),
          entries: [
            { name: 'word/media/image1.png', data: GREEN_PNG },
            { name: 'word/media/image2.png', data: GREEN_PNG },
          ],
        },
      ),
    );
    expect(picturesOf(document).map((p) => p.media)).toEqual([GREEN_PNG_SHA, GREEN_PNG_SHA]);
    expect(Object.keys(document.media ?? {})).toEqual([GREEN_PNG_SHA]);
  });

  it.each([
    ['anchored', wordPicture({ anchor: true })],
    ['rotated', wordPicture({ xfrm: ' rot="1800000"' })],
    ['flipped', wordPicture({ xfrm: ' flipH="1"' })],
    [
      'outlined',
      wordPicture({
        spPr: '<a:prstGeom prst="rect"/><a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
      }),
    ],
    ['an ellipse', wordPicture({ spPr: '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>' })],
    ['recoloured', wordPicture({ blip: '<a:grayscl/>' })],
    [
      'an SVG with its fallback',
      wordPicture({
        blip: '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId5"/></a:ext></a:extLst>',
      }),
    ],
    [
      'linked itself',
      wordPicture({
        docPrChildren:
          '<a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:id="rId5"/>',
      }),
    ],
    [
      'cropped outward',
      wordPicture({ blipFill: '<a:srcRect l="-10000"/><a:stretch><a:fillRect/></a:stretch>' }),
    ],
    ['tiled', wordPicture({ blipFill: '<a:tile/>' })],
    ['a missing part', wordPicture({ embed: 'r:embed="rId9"' })],
  ])("keeps Word's picture %s as the file has it", async (_, run) => {
    const document = await read(wordDocx(run));
    expect(picturesOf(document)).toEqual([]);
    expect(keptNames(document)).toEqual(['drawing']);
  });

  it("keeps Word's picture of a media type it does not map", async () => {
    const emf = new Uint8Array([1, 0, 0, 0, 108, 0, 0, 0]);
    const document = await read(wordDocx(wordPicture(), { bytes: emf, name: 'media/image1.emf' }));
    expect(keptNames(document)).toEqual(['drawing']);
  });

  it.each([
    ['anchored to the paragraph', LO_FRAME({ anchor: 'paragraph' })],
    ['rotated', LO_FRAME({ attrs: ' draw:transform="rotate (-0.52) translate (0.47in -0.27in)"' })],
    ['moved off the baseline', LO_FRAME({ attrs: ' svg:y="-0.2in"' })],
    [
      'with a fallback picture',
      LO_FRAME({
        image:
          '<draw:image xlink:href="Pictures/a.svg"/><draw:image xlink:href="Pictures/10000000000000820000005CDC6B3555.png"/>',
      }),
    ],
    [
      'linked to the web',
      LO_FRAME({ image: '<draw:image xlink:href="https://example.com/a.png"/>' }),
    ],
    [
      'holding a caption',
      LO_FRAME({ image: '<draw:text-box><text:p>Caption</text:p></draw:text-box>' }),
    ],
  ])("keeps LibreOffice's picture %s as the file has it", async (_, frame) => {
    const document = await read(loOdt(frame));
    expect(picturesOf(document)).toEqual([]);
    expect(keptNames(document)).toEqual(['frame']);
  });

  it.each([
    ['a border', ' fo:border="0.5pt solid #000000"'],
    ['brightness', ' draw:luminance="10%"'],
    ['a mirror', ' style:mirror="horizontal"'],
  ])("keeps LibreOffice's picture whose style gives it %s", async (_, extra) => {
    const name = extra.trim().split('=')[0]!;
    const graphic = LO_GRAPHIC().replace(new RegExp(` ${name}="[^"]*"`), extra);
    const document = await read(loOdt(LO_FRAME(), graphic));
    expect(keptNames(document)).toEqual(['frame']);
  });

  it('keeps pictures past the most a text document holds, in reading order', async () => {
    const document = await read(wordDocx(wordPicture() + wordPicture()), { maxObjects: 1 });
    expect(inlinesOf(document).map((i) => i.type)).toEqual(['picture', 'kept']);
  });
});

describe('an entry kept content still names', () => {
  it('stays kept in a Word file, written once, its picture held too', async () => {
    const document = await read(wordDocx(wordPicture() + wordPicture({ anchor: true })));
    expect(inlinesOf(document).map((i) => i.type)).toEqual(['picture', 'kept']);
    const source = document.source?.format === 'ooxml' ? document.source : undefined;
    expect(source?.parts.map((p) => p.name)).toContain('word/media/image2.png');
    const bytes = write(document, 'docx');
    const pkg = await readOoxmlPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    expect([...pkg.package.parts.keys()].filter((n) => n.startsWith('word/media/'))).toEqual([
      'word/media/image2.png',
    ]);
    const back = await read(bytes);
    expect(inlinesOf(back).map((i) => i.type)).toEqual(['picture', 'kept']);
    expect(picturesOf(back)).toEqual(picturesOf(document));
  });

  it('stays kept in an OpenDocument file, written once, its picture held too', async () => {
    const document = await read(loOdt(LO_FRAME() + LO_FRAME({ anchor: 'paragraph' })));
    expect(inlinesOf(document).map((i) => i.type)).toEqual(['picture', 'kept']);
    const bytes = write(document, 'odt');
    const pkg = await readOdfPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    expect([...pkg.package.entries.keys()].filter((n) => n.startsWith('Pictures/'))).toEqual([
      'Pictures/10000000000000820000005CDC6B3555.png',
    ]);
    expect(picturesOf(await read(bytes))).toEqual(picturesOf(document));
  });
});

describe('pictures written', () => {
  it.each([
    ['ooxml', 'docx'],
    ['odf', 'odt'],
    ['odf', 'fodt'],
  ] as const)('writes every picture and reads it back the same (%s, %s)', async (format, type) => {
    const made = CONSTRUCTS.pictures!(format);
    const back = await read(write(made, type));
    expect(modelOf(back)).toEqual(modelOf(made));
    expect(Pictures.ofDocument(back)).toHaveLength(5);
  });

  it('names new media by their key, in the package and its manifest', async () => {
    const odtBytes = write(CONSTRUCTS.pictures!('odf'), 'odt');
    const odf = await readOdfPackage(new Uint8Array(odtBytes));
    if (!odf.ok) throw new Error(odf.rejection);
    expect([...odf.package.entries.keys()].filter((n) => n.startsWith('Pictures/'))).toEqual([
      `Pictures/${GREEN_PNG_SHA}.png`,
      `Pictures/${BLUE_PNG_SHA}.png`,
    ]);
    expect(odf.package.mediaTypes.get(`Pictures/${GREEN_PNG_SHA}.png`)).toBe('image/png');
    const content = decoder.decode(odf.package.entries.get('content.xml'));
    const styles = decoder.decode(odf.package.entries.get('styles.xml'));
    const names = [...(content + styles).matchAll(/draw:name="([^"]*)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(['Picture 1', 'Picture 2', 'Picture 3', 'Picture 4', 'Picture 5']);
    expect(content).toContain('<svg:title>Field</svg:title><svg:desc>A green field</svg:desc>');

    const ooxml = await readOoxmlPackage(
      new Uint8Array(write(CONSTRUCTS.pictures!('ooxml'), 'docx')),
    );
    if (!ooxml.ok) throw new Error(ooxml.rejection);
    expect([...ooxml.package.parts.keys()].filter((n) => n.startsWith('word/media/'))).toEqual([
      `word/media/${GREEN_PNG_SHA}.png`,
      `word/media/${BLUE_PNG_SHA}.png`,
    ]);
    const main = decoder.decode(ooxml.package.parts.get('word/document.xml'));
    expect(main).toContain(
      '<wp:docPr id="1" name="Picture 1" descr="A green field" title="Field"/>',
    );
  });

  it('writes no media a picture no longer holds', async () => {
    const made = CONSTRUCTS.pictures!('odf');
    const withoutBlue = {
      ...made,
      body: made.body.slice(0, 1),
      section: TextDocumentBlankSection(made),
    };
    const odf = await readOdfPackage(new Uint8Array(write(withoutBlue, 'odt')));
    if (!odf.ok) throw new Error(odf.rejection);
    expect([...odf.package.entries.keys()].filter((n) => n.startsWith('Pictures/'))).toEqual([
      `Pictures/${GREEN_PNG_SHA}.png`,
    ]);
  });

  it("writes a flat file's pictures as base64", () => {
    const flat = decoder.decode(write(CONSTRUCTS.pictures!('odf'), 'fodt'));
    expect(flat).toContain(`<office:binary-data>${base64OfBytes(BLUE_PNG).slice(0, 76)}\n`);
    expect(flat).not.toContain('xlink:href="Pictures/');
  });
});

describe('pictures converted', () => {
  it.each([
    ['odf', 'ooxml', 'docx'],
    ['ooxml', 'odf', 'odt'],
  ] as const)('carries every picture and its media from %s to %s', async (from, to, type) => {
    const { document, losses } = convertTextDocument(CONSTRUCTS.pictures!(from), to);
    expect(losses).toEqual([]);
    const back = await read(write(document, type));
    expect(modelOf(back)).toEqual(modelOf(document));
  });

  it("names the converted media anew, the arriving entry's name being the other format's", async () => {
    const word = await read(wordDocx(wordPicture()));
    const { document } = convertTextDocument(word, 'odf');
    expect(document.media?.[GREEN_PNG_SHA]).toEqual({ mediaType: 'image/png', bytes: GREEN_PNG });
  });
});

function TextDocumentBlankSection(document: TextDocument) {
  const { headers: _, ...section } = document.section;
  return section;
}
