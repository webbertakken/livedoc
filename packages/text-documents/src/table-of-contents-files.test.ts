// docs/specs/034-text-documents/links-and-navigation.md "Table of contents", standard-mapping.md "Tables of contents":
// a table of contents is one block, its look, its levels and its entries; ODF `text:table-of-content` and OOXML a `TOC`
// field in a `w:sdt` of the Table of Contents gallery read as one (no page numbers is With blue links, a dot leader
// Dotted, Plain text otherwise; a PAGEREF's shown text the page number) and are written so, read back the same; the
// live state and conversion carry it.
import { readOoxmlPackage, readOdfPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Block, Paragraph } from './model/blocks';
import { CONTENTS_LEVELS_MAX, Contents, type TableOfContents } from './model/contents';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, W_P, W_R } from './testing/packages';
import { TextDocumentState } from './text-document-state';
import { writeLiveDocument } from './live/live-write';

async function read(bytes: Uint8Array): Promise<TextDocument> {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result.document;
}

function written(document: TextDocument, type: 'fodt' | 'odt' | 'docx'): Uint8Array {
  const result = writeTextDocumentFile(document, type);
  if (!result.ok) throw new Error(result.rejection);
  return result.bytes;
}

const contentsOf = (document: TextDocument) =>
  document.body.find((b): b is TableOfContents => b.type === 'contents');

// An entry as its text and the link it carries: "Alpha\t1 -> #a".
const entry = (p: Paragraph) => {
  const text = p.inlines
    .map((i) => (i.type === 'run' || i.type === 'field' ? i.text : ''))
    .join('');
  const links = [...new Set(p.inlines.flatMap((i) => (i.link ? [i.link] : [])))];
  return `${text}${links.length ? ` -> ${links.join(',')}` : ''}`;
};
const shape = (block: TableOfContents | undefined) =>
  block && { look: block.look, levels: block.levels, entries: block.entries.map(entry) };

const ODF_TEMPLATE = (level: number, page: string) =>
  `<text:table-of-content-entry-template text:outline-level="${level}" text:style-name="Contents_20_${level}"><text:index-entry-link-start/><text:index-entry-text/>${page}<text:index-entry-link-end/></text:table-of-content-entry-template>`;
const ODF_PAGES = (leader: string) =>
  `<text:index-entry-tab-stop style:type="right"${leader}/><text:index-entry-page-number/>`;
const odfContents = (levels: string, page: string, body: string) =>
  fodt(
    `<text:table-of-content text:name="Table of Contents1" text:protected="true"><text:table-of-content-source${levels} text:use-index-marks="false"><text:index-title-template>Contents</text:index-title-template>${ODF_TEMPLATE(1, page)}${ODF_TEMPLATE(2, page)}</text:table-of-content-source><text:index-body><text:index-title text:name="t"><text:p>Contents</text:p></text:index-title>${body}</text:index-body></text:table-of-content><text:h text:outline-level="1"><text:bookmark text:name="_a"/>Alpha</text:h>`,
  );
const ODF_ENTRIES = (page: boolean) =>
  `<text:p text:style-name="Contents_20_1"><text:a xlink:type="simple" xlink:href="#_a">Alpha${page ? '<text:tab/>1' : ''}</text:a></text:p><text:p text:style-name="Contents_20_2"><text:a xlink:type="simple" xlink:href="#_b">Beta${page ? '<text:tab/>2' : ''}</text:a></text:p>`;

describe('Contents', () => {
  it('holds levels 1 to 6, all of them when unsaid', () => {
    expect(Contents.levelsOf(3)).toBe(3);
    expect(Contents.levelsOf(10)).toBe(CONTENTS_LEVELS_MAX);
    expect(Contents.levelsOf(undefined)).toBe(6);
    expect(Contents.levelsOf(0)).toBe(6);
    expect(Contents.levelsOf(Number.NaN)).toBe(6);
  });

  it('reads its look from its page numbers and their leader', () => {
    expect(Contents.lookOf({ pages: false, dotted: true })).toBe('links');
    expect(Contents.lookOf({ pages: true, dotted: true })).toBe('dotted');
    expect(Contents.lookOf({ pages: true, dotted: false })).toBe('plain');
  });
});

describe('a table of contents in ODF', () => {
  it('reads as one block: Dotted, its levels, its entries; the index title left out', async () => {
    const document = await read(
      odfContents(
        ' text:outline-level="3"',
        ODF_PAGES(' style:leader-char="."'),
        ODF_ENTRIES(true),
      ),
    );
    expect(shape(contentsOf(document))).toEqual({
      look: 'dotted',
      levels: 3,
      entries: ['Alpha\t1 -> #_a', 'Beta\t2 -> #_b'],
    });
    expect(document.body[0]!.type).toBe('contents');
    expect(document.body[1]!.type).toBe('paragraph');
  });

  it('reads Plain text without a leader, With blue links without page numbers', async () => {
    const plain = await read(
      odfContents('', ODF_PAGES(' style:leader-char=" "'), ODF_ENTRIES(true)),
    );
    expect(shape(contentsOf(plain))).toMatchObject({ look: 'plain', levels: 6 });
    const links = await read(odfContents('', '', ODF_ENTRIES(false)));
    expect(shape(contentsOf(links))).toMatchObject({ look: 'links' });
  });
});

const W_TOC_BEGIN = (instr: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
const W_END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const W_PAGEREF = (anchor: string, page: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF ${anchor} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${page}</w:t></w:r>${W_END}`;
const W_ENTRY = (
  style: string,
  anchor: string,
  text: string,
  page: string,
  before = '',
  after = '',
) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs></w:pPr>${before}<w:hyperlink w:anchor="${anchor}">${W_R(text)}<w:r><w:tab/></w:r>${page}</w:hyperlink>${after}</w:p>`;
const W_SDT = (inner: string) =>
  `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;

describe('a table of contents in OOXML', () => {
  it('reads Word’s own as one block: its levels, Dotted, PAGEREF’s shown page numbers', async () => {
    const document = await read(
      docx(
        W_SDT(
          `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${W_R('Contents')}</w:p>` +
            W_ENTRY(
              'TOC1',
              '_Toc1',
              'Alpha',
              W_PAGEREF('_Toc1', '1'),
              W_TOC_BEGIN('TOC \\o "1-3" \\h \\z \\u'),
            ) +
            W_ENTRY('TOC2', '_Toc2', 'Beta', W_PAGEREF('_Toc2', '2'), '', W_END),
        ) + W_P(W_R('After')),
      ),
    );
    expect(shape(contentsOf(document))).toEqual({
      look: 'dotted',
      levels: 3,
      entries: ['Contents', 'Alpha\t1 -> #_Toc1', 'Beta\t2 -> #_Toc2'],
    });
    expect(document.body.map((b) => b.type)).toEqual(['contents', 'paragraph']);
  });

  it('reads a TOC field standing alone as one; \\n without a range is With blue links', async () => {
    const document = await read(
      docx(
        W_P(W_R('Before')) +
          `<w:p>${W_TOC_BEGIN('TOC \\o "1-2" \\h \\n')}<w:hyperlink w:anchor="_a">${W_R('Alpha')}</w:hyperlink></w:p>` +
          `<w:p><w:hyperlink w:anchor="_b">${W_R('Beta')}</w:hyperlink>${W_END}</w:p>` +
          W_P(W_R('After')),
      ),
    );
    expect(document.body.map((b) => b.type)).toEqual(['paragraph', 'contents', 'paragraph']);
    expect(shape(contentsOf(document))).toEqual({
      look: 'links',
      levels: 2,
      entries: ['Alpha -> #_a', 'Beta -> #_b'],
    });
  });

  it('reads Plain text where no dot leads to the page numbers', async () => {
    const plain = W_ENTRY(
      'TOC1',
      '_a',
      'Alpha',
      W_R('1'),
      W_TOC_BEGIN('TOC \\o "1-3" \\h'),
      W_END,
    ).replace(' w:leader="dot"', '');
    expect(shape(contentsOf(await read(docx(W_SDT(plain)))))).toMatchObject({ look: 'plain' });
  });
});

describe('a table of contents written and read back', () => {
  for (const type of ['fodt', 'odt', 'docx'] as const)
    for (const look of ['plain', 'dotted', 'links'] as const)
      it(`keeps its look (${look}), levels and entries in ${type}`, async () => {
        const document = CONSTRUCTS.contents!(type === 'docx' ? 'ooxml' : 'odf');
        const block = contentsOf(document)!;
        const withLook: TextDocument = {
          ...document,
          body: document.body.map((b): Block =>
            b.type === 'contents'
              ? {
                  ...b,
                  look,
                  // Dotted is its entries' dotted stop; Plain text a stop with no leader; blue links no page numbers.
                  entries: b.entries.map((p) => ({
                    ...p,
                    props:
                      look === 'dotted'
                        ? p.props
                        : look === 'plain'
                          ? { tabStops: [{ position: 468, align: 'end' }] }
                          : {},
                    inlines:
                      look === 'links'
                        ? p.inlines.map((i) =>
                            i.type === 'run' ? { ...i, text: i.text.replace(/\t.*$/, '') } : i,
                          )
                        : p.inlines,
                  })),
                }
              : b,
          ),
        };
        const back = contentsOf(await read(written(withLook, type)));
        expect(back?.look).toBe(look);
        expect(back?.levels).toBe(block.levels);
        expect(back?.entries.map(entry)).toEqual(contentsOf(withLook)!.entries.map(entry));
      });

  it('writes ODF a protected text:table-of-content with a template per level', async () => {
    const bytes = written(CONSTRUCTS.contents!('odf'), 'odt');
    const pkg = await readOdfPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const xml = new TextDecoder().decode(pkg.package.entries.get('content.xml'));
    expect(xml).toContain(
      '<text:table-of-content text:name="Table of Contents1" text:protected="true">',
    );
    expect(xml).toContain('text:outline-level="2"');
    expect(xml.match(/<text:table-of-content-entry-template /g)).toHaveLength(2);
    expect(xml).toContain('style:leader-char="."');
  });

  it('writes OOXML a w:sdt of the Table of Contents gallery, its TOC field over the entries', async () => {
    const bytes = written(CONSTRUCTS.contents!('ooxml'), 'docx');
    const pkg = await readOoxmlPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const xml = new TextDecoder().decode(pkg.package.parts.get('word/document.xml'));
    expect(xml).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(xml).toContain('TOC \\o &quot;1-2&quot; \\h \\z \\u');
    expect(xml).toContain('<w:hyperlink w:anchor="_alpha0000001"');
  });

  it('carries it through conversion both ways and the live state', () => {
    const odf = CONSTRUCTS.contents!('odf');
    const ooxml = convertTextDocument(odf, 'ooxml').document;
    expect(shape(contentsOf(ooxml))).toEqual(shape(contentsOf(odf)));
    expect(shape(contentsOf(convertTextDocument(ooxml, 'odf').document))).toEqual(
      shape(contentsOf(odf)),
    );
    const doc = new Y.Doc();
    writeLiveDocument(doc, odf);
    expect(shape(contentsOf(TextDocumentState.document(doc, 'odf')))).toEqual(
      shape(contentsOf(odf)),
    );
  });
});
