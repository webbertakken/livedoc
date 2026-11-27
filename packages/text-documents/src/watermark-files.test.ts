// docs/specs/034-text-documents/page-layout.md "Watermark", "In the file": a text watermark is written into every header
// a section's pages show (an empty one made where the first section shows none), as Word's VML text path and
// LibreOffice's fontwork shape, and read back as the document's watermark, taken out of every header; a header left as
// one empty paragraph by it is no header; anything else in a header kept as it is.
import { describe, expect, it } from 'vitest';
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Block, SectionBreak } from './model/blocks';
import { watermarkBox, Watermarks, type Watermark } from './model/watermark';
import type { TextDocument } from './model/text-document';
import { readOoxmlWatermark, vmlColour, vmlFraction } from './ooxml/ooxml-watermark';
import { CONSTRUCTS } from './testing/constructs';
import { docx, W_P, W_R } from './testing/packages';

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};
const breaks = (d: TextDocument) =>
  d.body.filter((b: Block): b is SectionBreak => b.type === 'section');
const texts = (blocks: readonly Block[] | undefined) =>
  (blocks ?? []).map((b) =>
    b.type === 'paragraph'
      ? b.inlines.map((i) => (i.type === 'run' ? i.text : `[${i.type}]`)).join('')
      : `[${b.type}]`,
  );

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const VML =
  'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"';

// Word's watermark, as Word writes it: in a Watermarks building block, silver, half clear, turned 315°, Auto size.
const WORD_SHAPE = `<w:r><w:rPr><w:noProof/></w:rPr><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:textpath on="t" fitshape="t"/></v:shapetype><v:shape id="PowerPlusWaterMarkObject357476642" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:412.4pt;height:247.45pt;rotation:315;z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="DRAFT"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r>`;

const withHeader = (header: string) =>
  docx(
    `${W_P(W_R('Body text.'))}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>`,
    {
      rels: `<Relationship Id="rIdH" Type="${RELATIONSHIP_TYPES.header}" Target="header1.xml"/>`,
      entries: [
        {
          name: 'word/header1.xml',
          data: `<?xml version="1.0"?><w:hdr xmlns:w="${W}" ${VML}>${header}</w:hdr>`,
        },
      ],
    },
  );

const DRAFT: Watermark = {
  kind: 'text',
  text: 'DRAFT',
  font: 'Calibri',
  colour: '#c0c0c0',
  transparency: 0.5,
  layout: 'diagonal',
};

describe('a watermark in the files', () => {
  it.each([
    ['ooxml', 'docx'],
    ['odf', 'odt'],
    ['odf', 'fodt'],
  ] as const)(
    'writes it into the headers and reads it back alone (%s, %s)',
    async (format, type) => {
      const made = CONSTRUCTS.watermark!(format);
      const back = await read(write(made, type));
      expect(back.watermark).toEqual(made.watermark);
      // The empty headers made to hold it are no headers again; the second section's own first page header is kept.
      expect(back.section.headers).toBeUndefined();
      expect(texts(breaks(back)[0]!.headers?.header?.first?.blocks)).toEqual([
        'Its own first page',
      ]);
      expect(breaks(back)[0]!.headers?.header?.default).toBeUndefined();
    },
  );

  it('writes one into every header the pages show, made where the first section shows none', () => {
    const made = CONSTRUCTS.watermark!('ooxml');
    const placed = Watermarks.place(
      made,
      () => ({ type: 'kept', name: 'mark', xml: { xml: '<mark/>', ns: {} }, props: {} }),
      'Normal',
    );
    expect(texts(placed.section.headers?.header?.default?.blocks)).toEqual(['[kept]']);
    expect(texts(breaks(placed)[0]!.headers?.header?.first?.blocks)).toEqual([
      '[kept]',
      'Its own first page',
    ]);
    // Its default header links to the first section's.
    expect(breaks(placed)[0]!.headers?.header?.default).toBeUndefined();
  });

  it('writes none without words', async () => {
    const made = { ...CONSTRUCTS.watermark!('odf'), watermark: { ...DRAFT, text: '  ' } };
    const back = await read(write(made, 'odt'));
    expect(back.watermark).toBeUndefined();
    expect(back.section.headers).toBeUndefined();
  });

  it('carries it across a conversion', () => {
    const { document } = convertTextDocument(CONSTRUCTS.watermark!('odf'), 'ooxml');
    expect(document.watermark).toEqual(CONSTRUCTS.watermark!('odf').watermark);
  });
});

describe('OOXML', () => {
  it("reads Word's watermark from its building block, the header it leaves empty taken away", async () => {
    const back = await read(
      withHeader(
        `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Watermarks"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent><w:p>${WORD_SHAPE}</w:p></w:sdtContent></w:sdt><w:p/>`,
      ),
    );
    expect(back.watermark).toEqual(DRAFT);
    expect(back.section.headers).toBeUndefined();
  });

  it('keeps what else the header holds', async () => {
    const back = await read(withHeader(`<w:p>${WORD_SHAPE}${W_R('Company')}</w:p>`));
    expect(back.watermark?.text).toBe('DRAFT');
    expect(texts(back.section.headers?.header?.default?.blocks)).toEqual(['Company']);
  });

  it('reads a size, bold, italic, a hex colour and an opacity in 65536ths; no rotation is horizontal', () => {
    const shape = WORD_SHAPE.replace('rotation:315;', '')
      .replace('fillcolor="silver"', 'fillcolor="#3c78d8 [3204]"')
      .replace('opacity=".5"', 'opacity="49152f"')
      .replace('font-size:1pt', 'font-size:48pt;font-weight:bold;font-style:italic');
    expect(
      readOoxmlWatermark({
        type: 'kept',
        name: 'pict',
        xml: {
          xml: shape,
          ns: {
            w: W,
            v: 'urn:schemas-microsoft-com:vml',
            o: 'urn:schemas-microsoft-com:office:office',
            w10: 'urn:schemas-microsoft-com:office:word',
          },
        },
        props: {},
      }),
    ).toEqual({
      ...DRAFT,
      size: 48,
      bold: true,
      italic: true,
      colour: '#3c78d8',
      transparency: 0.25,
      layout: 'horizontal',
    });
  });

  it('reads VML colours and fractions as Word writes them', () => {
    expect(vmlColour('silver')).toBe('#c0c0c0');
    expect(vmlColour('#ABC')).toBe('#aabbcc');
    expect(vmlColour('nonsense')).toBeUndefined();
    expect(vmlFraction('.5')).toBe(0.5);
    expect(vmlFraction('32768f')).toBe(0.5);
    expect(vmlFraction('40%')).toBe(0.4);
    expect(vmlFraction('x')).toBeUndefined();
  });

  it('sizes the shape: Auto across the text width, a size by its height', () => {
    expect(watermarkBox(DRAFT, 468).width).toBeCloseTo(421.2);
    expect(watermarkBox({ ...DRAFT, size: 40 }, 468)).toEqual({ width: 120, height: 40 });
  });
});

describe('ODF', () => {
  // LibreOffice's watermark, as LibreOffice 24.2 writes one, in a flat file.
  const libreOffice = `<?xml version="1.0" encoding="UTF-8"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.4" office:mimetype="application/vnd.oasis.opendocument.text"><office:automatic-styles><style:style style:name="Mgr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="#c0c0c0" draw:opacity="50%"/></style:style><style:style style:name="MP2" style:family="paragraph"><style:text-properties style:font-name="Calibri" fo:font-size="1pt"/></style:style><style:style style:name="MT1" style:family="text"><style:text-properties style:font-name="Calibri" fo:font-size="1pt"/></style:style><style:page-layout style:name="Mpm1"><style:page-layout-properties fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="1in" fo:margin-bottom="1in" fo:margin-left="1in" fo:margin-right="1in"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Mpm1"><style:header><text:p><draw:custom-shape text:anchor-type="char" draw:z-index="0" draw:name="PowerPlusWaterMarkObject357476642" draw:style-name="Mgr1" draw:text-style-name="MP2" svg:width="5.728in" svg:height="2.5524in" draw:transform="rotate (0.785398163397448) translate (0.322222222222222in 5.62222222222222in)"><text:p><text:span text:style-name="MT1">DRAFT</text:span></text:p><draw:enhanced-geometry draw:type="fontwork-plain-text"/></draw:custom-shape></text:p><text:p/></style:header></style:master-page></office:master-styles><office:body><office:text><text:p>Body text.</text:p></office:text></office:body></office:document>`;

  it("reads LibreOffice's watermark with its styles, the header it leaves empty taken away", async () => {
    const back = await read(new TextEncoder().encode(libreOffice));
    expect(back.watermark).toEqual(DRAFT);
    expect(back.section.headers).toBeUndefined();
  });

  it('writes its shape centred on the text area and its styles', () => {
    const text = new TextDecoder().decode(write(CONSTRUCTS.watermark!('odf'), 'fodt'));
    expect(text).toContain('draw:name="PowerPlusWaterMarkObject1"');
    expect(text).toContain('draw:fill-color="#6aa84f" draw:opacity="70%"');
    expect(text).toContain('fo:font-family="Georgia" fo:font-size="54pt" fo:font-weight="bold"');
    expect(text).toContain('>CONFIDENTIAL</text:p>');
  });
});
