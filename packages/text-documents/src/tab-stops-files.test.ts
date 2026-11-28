// docs/specs/034-text-documents/standard-mapping.md "The model" (tab stops), "Documented losses": tab stops as both
// formats hold them, read to positions from the text area's start and written back where each suite draws them.
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Paragraph } from './model/blocks';
import { Styles } from './model/styles';
import type { TabStop } from './model/tab-stops';
import { TextDocument } from './model/text-document';
import { docx, W_P, W_R } from './testing/packages';

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r;
};
const paragraphs = (document: TextDocument) =>
  document.body.filter((b): b is Paragraph => b.type === 'paragraph');
const left = (position: number): TabStop => ({ position, align: 'start' });
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const flat = (inner: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.text">${inner}</office:document>`,
  );
const SETTINGS = (relative: boolean) =>
  `<office:settings><config:config-item-set config:name="ooo:configuration-settings"><config:config-item config:name="TabsRelativeToIndent" config:type="boolean">${relative}</config:config-item></config:config-item-set></office:settings>`;
const STYLES = `<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties style:tab-stop-distance="0.5in"/></style:default-style><style:style style:name="Standard" style:family="paragraph"/><style:style style:name="Indented" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.5in"><style:tab-stops><style:tab-stop style:position="1in"/><style:tab-stop style:position="3in" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style></office:styles>`;
const AUTO = `<office:automatic-styles><style:style style:name="P1" style:family="paragraph" style:parent-style-name="Indented"><style:paragraph-properties fo:margin-left="1in"/></style:style><style:style style:name="P2" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties><style:tab-stops><style:tab-stop style:position="2in" style:type="char" style:char=","/><style:tab-stop style:position="4in" style:type="center" style:leader-text="-"/></style:tab-stops></style:paragraph-properties></style:style></office:automatic-styles>`;
const BODY = `<office:body><office:text><text:p text:style-name="Indented">a<text:tab/>b</text:p><text:p text:style-name="P1">c</text:p><text:p text:style-name="P2">d</text:p></office:text></office:body>`;

describe('ODF tab stops', () => {
  it("counts the default style's own stops from its indent too, and writes them back so", async () => {
    const styles = `<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-left="0.25in"><style:tab-stops><style:tab-stop style:position="1in"/></style:tab-stops></style:paragraph-properties></style:default-style></office:styles>`;
    const { document } = await read(
      flat(`${styles}<office:body><office:text><text:p>a</text:p></office:text></office:body>`),
    );
    expect(document.defaults.paragraph.tabStops).toEqual([left(90)]);
    const edited = {
      ...document,
      defaults: { paragraph: { ...document.defaults.paragraph, indentStart: 36 }, text: {} },
    };
    const written = writeTextDocumentFile(edited, 'fodt');
    expect(text(written.bytes)).toContain('style:position="54pt"');
  });

  it('counts positions from the indent where the file does, and gives a differently indented paragraph its own', async () => {
    const { document, report } = await read(flat(`${STYLES}${AUTO}${BODY}`));
    const indented = Styles.byId(document.styles, 'Indented')!;
    expect(indented.paragraph.tabStops).toEqual([
      left(108),
      { position: 252, align: 'end', leader: 'dot' },
    ]);
    expect(document.defaults.paragraph.tabInterval).toBe(36);
    const [a, c, d] = paragraphs(document);
    expect(a!.props.tabStops).toBeUndefined();
    expect(c!.props.tabStops).toEqual([left(144), { position: 288, align: 'end', leader: 'dot' }]);
    expect(d!.props.tabStops).toEqual([
      { position: 144, align: 'decimal', char: ',' },
      { position: 288, align: 'center', leader: 'hyphen' },
    ]);
    expect(report.dropped).toEqual([]);
  });

  it('reads positions as they are where the settings count from the text area', async () => {
    const { document } = await read(flat(`${SETTINGS(false)}${STYLES}${AUTO}${BODY}`));
    expect(Styles.byId(document.styles, 'Indented')!.paragraph.tabStops![0]).toEqual(left(72));
    expect(document.source).toMatchObject({ tabsFromIndent: false });
    expect(paragraphs(document)[1]!.props.tabStops).toBeUndefined();
  });

  it('writes an unchanged file back as it came, and an edited indent keeps its stops where they were drawn', async () => {
    const bytes = flat(`${STYLES}${AUTO}${BODY}`);
    const { document } = await read(bytes);
    const unchanged = writeTextDocumentFile(document, 'fodt');
    const again = await read(unchanged.bytes);
    expect(paragraphs(again.document).map((p) => p.props)).toEqual(
      paragraphs(document).map((p) => p.props),
    );
    expect(again.document.styles).toEqual(document.styles);

    const [a, ...rest] = paragraphs(document);
    const edited = {
      ...document,
      body: [{ ...a!, props: { ...a!.props, indentStart: 144 }, kept: undefined }, ...rest],
    };
    const written = writeTextDocumentFile(edited, 'fodt');
    // LibreOffice counts from the new indent: the stops are written less it, so they draw where they did.
    expect(text(written.bytes)).toContain(
      '<style:tab-stop style:position="-36pt" style:type="left"/>',
    );
    const back = await read(written.bytes);
    expect(paragraphs(back.document)[0]!.props.tabStops).toBeUndefined();
    expect(Styles.byId(back.document.styles, 'Indented')!.paragraph.tabStops).toEqual(
      indentedStops(),
    );
  });

  it('writes a new document counting from the text area, with the default interval', async () => {
    const blank = TextDocument.fromTexts(['a\tb']);
    const [p] = paragraphs(blank);
    const document = {
      ...blank,
      body: [{ ...p!, props: { indentStart: 36, tabStops: [left(100)] } }],
    };
    const written = writeTextDocumentFile(document, 'fodt');
    const xml = text(written.bytes);
    expect(xml).toContain('config:name="TabsRelativeToIndent" config:type="boolean">false<');
    expect(xml).toContain('style:tab-stop-distance="36pt"');
    const back = await read(written.bytes);
    expect(paragraphs(back.document)[0]!.props.tabStops).toEqual([left(100)]);
    expect(back.document.defaults.paragraph.tabInterval).toBe(36);
  });

  it("keeps an empty list as no stops at all, equal to its style's as none, and reports stops it cannot place", async () => {
    const auto = `<office:automatic-styles><style:style style:name="P3" style:family="paragraph" style:parent-style-name="Indented"><style:paragraph-properties><style:tab-stops/></style:paragraph-properties></style:style><style:style style:name="P4" style:family="paragraph"><style:paragraph-properties><style:tab-stops><style:tab-stop/><style:tab-stop style:position="40in"/></style:tab-stops></style:paragraph-properties></style:style></office:automatic-styles>`;
    const { document, report } = await read(
      flat(
        `${STYLES}${auto}<office:body><office:text><text:p text:style-name="P3">a</text:p><text:p text:style-name="P4">b</text:p></office:text></office:body>`,
      ),
    );
    expect(paragraphs(document).map((p) => p.props.tabStops)).toEqual([[], undefined]);
    expect(report.dropped).toEqual([{ reason: 'tab-stop', name: 'tab-stop', count: 2 }]);
  });
});

function indentedStops(): TabStop[] {
  return [left(108), { position: 252, align: 'end', leader: 'dot' }];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wordFile = (body: string, styles: string, settings: string) =>
  docx(body, {
    rels: `<Relationship Id="rId10" Type="${RELATIONSHIP_TYPES.styles}" Target="styles.xml"/><Relationship Id="rId11" Type="${RELATIONSHIP_TYPES.settings}" Target="settings.xml"/>`,
    entries: [
      {
        name: 'word/styles.xml',
        data: `<?xml version="1.0"?><w:styles xmlns:w="${W}">${styles}</w:styles>`,
      },
      {
        name: 'word/settings.xml',
        data: `<?xml version="1.0"?><w:settings xmlns:w="${W}">${settings}</w:settings>`,
      },
    ],
  });
const TAB = (val: string, pos: number, leader = '') =>
  `<w:tab w:val="${val}" w:pos="${pos}"${leader ? ` w:leader="${leader}"` : ''}/>`;
const WORD_STYLES = `<w:docDefaults><w:pPrDefault><w:pPr><w:tabs>${TAB('left', 720)}</w:tabs></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Toc"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs>${TAB('clear', 720)}${TAB('right', 9000, 'dot')}</w:tabs></w:pPr></w:style>`;

describe('OOXML tab stops', () => {
  it("merges `w:tabs` down the styles as Word does, and reads the document's interval", async () => {
    const body = [
      W_P(`<w:pPr><w:pStyle w:val="Toc"/></w:pPr>${W_R('a')}`),
      W_P(`<w:pPr><w:tabs>${TAB('center', 4320)}${TAB('clear', 720)}</w:tabs></w:pPr>${W_R('b')}`),
      W_P(
        `<w:pPr><w:pStyle w:val="Toc"/><w:tabs>${TAB('right', 9000, 'dot')}</w:tabs></w:pPr>${W_R('c')}`,
      ),
    ].join('');
    const { document, report } = await read(
      wordFile(body, WORD_STYLES, '<w:defaultTabStop w:val="708"/>'),
    );
    expect(document.defaults.paragraph).toMatchObject({ tabStops: [left(36)], tabInterval: 35.4 });
    expect(Styles.byId(document.styles, 'Toc')!.paragraph.tabStops).toEqual([
      { position: 450, align: 'end', leader: 'dot' },
    ]);
    const [a, b, c] = paragraphs(document);
    expect(a!.props.tabStops).toBeUndefined();
    expect(b!.props.tabStops).toEqual([{ position: 216, align: 'center' }]);
    expect(c!.props.tabStops).toBeUndefined();
    expect(report.dropped).toEqual([]);
  });

  it('writes the difference from what a paragraph inherits, read back the same', async () => {
    const { document } = await read(wordFile(W_P(W_R('a')), WORD_STYLES, ''));
    const [p] = paragraphs(document);
    const own: TabStop[] = [
      { position: 100, align: 'decimal' },
      { position: 200, align: 'start', leader: 'middle-dot' },
    ];
    const edited = { ...document, body: [{ ...p!, props: { tabStops: own }, kept: undefined }] };
    const written = writeTextDocumentFile(edited, 'docx');
    const back = await read(written.bytes);
    expect(paragraphs(back.document)[0]!.props.tabStops).toEqual(own);
  });

  it('reads bar and list stops as none and a heavy leader as an underline, each reported', async () => {
    const body = W_P(
      `<w:pPr><w:tabs>${TAB('bar', 100)}${TAB('num', 200)}${TAB('left', 300, 'heavy')}</w:tabs></w:pPr>${W_R('a')}`,
    );
    const { document, report } = await read(wordFile(body, '', ''));
    expect(paragraphs(document)[0]!.props.tabStops).toEqual([
      { position: 15, align: 'start', leader: 'underscore' },
    ]);
    expect(report.dropped.map((d) => d.name).sort()).toEqual([
      'bar tab stop',
      'heavy tab leader',
      'num tab stop',
    ]);
  });

  it("skips a stop with no position, reports one with no kind, and writes nothing for a list equal to the style's", async () => {
    const body = W_P(
      `<w:pPr><w:tabs><w:tab w:val="left"/><w:tab w:pos="100"/></w:tabs></w:pPr>${W_R('a')}`,
    );
    const { document, report } = await read(
      wordFile(body, WORD_STYLES, '<w:defaultTabStop w:val="0"/>'),
    );
    expect(paragraphs(document)[0]!.props.tabStops).toBeUndefined();
    expect(document.defaults.paragraph.tabInterval).toBeUndefined();
    expect(report.dropped).toEqual([{ reason: 'tab-stop', name: 'unknown tab stop', count: 1 }]);
    const [p] = paragraphs(document);
    const same = {
      ...document,
      body: [{ ...p!, props: { tabStops: [left(36)] }, kept: undefined }],
    };
    const written = writeTextDocumentFile(same, 'docx');
    const back = await read(written.bytes);
    expect(paragraphs(back.document)[0]!.props.tabStops).toBeUndefined();
  });

  it("writes a new Word file's default interval into its settings", async () => {
    const blank = TextDocument.blank({ format: 'ooxml' });
    const written = writeTextDocumentFile(blank, 'docx');
    const back = await read(written.bytes);
    expect(back.document.defaults.paragraph.tabInterval).toBe(36);
  });
});
