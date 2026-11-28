import { describe, expect, it } from 'vitest';
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { TextDocument } from './model/text-document';
import { docx, fodt, odt, W_P, W_R } from './testing/packages';

const texts = async (bytes: Uint8Array) => {
  const read = await readTextDocumentFile(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return {
    texts: TextDocument.paragraphTexts(read.document),
    report: read.report,
    document: read.document,
  };
};

const BOMB = (() => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, 60_000);
  new DataView(b.buffer).setUint32(20, 60_000);
  return b;
})();

// docs/research/docs-open-standard/import-security.md, one test per abuse case; files-and-print.md "Import security".
describe('import security', () => {
  it('refuses a zip bomb and a package of too many entries before inflating (package_too_large)', async () => {
    const file = docx(W_P(W_R('x'.repeat(5000))));
    expect(
      await readTextDocumentFile(file, {
        budgets: { bytes: 1e6, inflatedBytes: 1000, entries: 100 },
      }),
    ).toMatchObject({ rejection: 'package_too_large' });
    expect(
      await readTextDocumentFile(file, { budgets: { bytes: 1e6, inflatedBytes: 1e6, entries: 2 } }),
    ).toMatchObject({ rejection: 'package_too_large' });
    expect(
      await readTextDocumentFile(file, {
        budgets: { bytes: 10, inflatedBytes: 1e6, entries: 100 },
      }),
    ).toMatchObject({ rejection: 'package_too_large' });
    expect(
      await readTextDocumentFile(fodt('<text:p>x</text:p>'), {
        budgets: { bytes: 10, inflatedBytes: 1e6, entries: 100 },
      }),
    ).toMatchObject({ rejection: 'package_too_large' });
  });

  it('refuses entry names that would be paths (package_damaged)', async () => {
    expect(
      await readTextDocumentFile(
        docx(W_P(''), { entries: [{ name: '../../evil.xml', data: '<x/>' }] }),
      ),
    ).toMatchObject({ rejection: 'package_damaged' });
    expect(
      await readTextDocumentFile(odt('', { entries: [{ name: 'C:/evil', data: 'x' }] })),
    ).toMatchObject({ rejection: 'package_damaged' });
  });

  it('refuses any DOCTYPE: external entities and entity expansion (xml_doctype_refused)', async () => {
    const xxe =
      '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>';
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><r>&b;</r>';
    expect(await readTextDocumentFile(odt('', { content: xxe }))).toMatchObject({
      rejection: 'xml_doctype_refused',
      entry: 'content.xml',
    });
    expect(await readTextDocumentFile(new TextEncoder().encode(laughs))).toMatchObject({
      rejection: 'xml_doctype_refused',
    });
    const docxXxe = docx('', { entries: [] });
    expect((await readTextDocumentFile(docxXxe)).ok).toBe(true);
  });

  it('drops macros, never keeping them, and says so', async () => {
    const odf = await texts(
      odt('<text:p>Hi</text:p>', {
        entries: [
          { name: 'Basic/Standard/Module1.xml', data: 'x' },
          { name: 'Scripts/python/a.py', data: 'x' },
        ],
      }),
    );
    expect(odf.report.dropped).toEqual([
      { reason: 'macro', name: 'Basic/Standard/Module1.xml', count: 1 },
      { reason: 'macro', name: 'Scripts/python/a.py', count: 1 },
    ]);
    const docm = await texts(
      docx(W_P(W_R('Hi')), {
        mainType: 'application/vnd.ms-word.document.macroEnabled.main+xml',
        rels: `<Relationship Id="rId9" Type="${RELATIONSHIP_TYPES.vbaProject}" Target="vbaProject.bin"/>`,
        entries: [{ name: 'word/vbaProject.bin', data: 'x' }],
      }),
    );
    expect(docm.texts).toEqual(['Hi']);
    expect(docm.report.dropped).toEqual([
      { reason: 'macro', name: 'word/vbaProject.bin', count: 1 },
    ]);
    const written = writeTextDocumentFile(docm.document, 'docx');
    const again = await texts(written.bytes);
    expect(again && again.texts).toEqual(['Hi']);
    expect(new TextDecoder().decode(written.bytes).includes('vbaProject')).toBe(false);
  });

  it('drops fields that run things, keeping what they last showed', async () => {
    const field = (instr: string) =>
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${W_R('shown')}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const read = await texts(
      docx(
        W_P(`${W_R('a ')}${field('DDEAUTO cmd "/c calc"')}${W_R(' b ')}${field('AUTHOR')}`) +
          W_P(
            `<w:fldSimple w:instr="INCLUDETEXT &quot;c:/secret.txt&quot;">${W_R('included')}</w:fldSimple>`,
          ) +
          `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc>${W_P(field('DDE x'))}</w:tc></w:tr></w:tbl>`,
      ),
    );
    // A field in a table's cell is read as the body's (tables.md "In the formats").
    expect(read.texts).toEqual(['a shown b shown', 'included', 'shown']);
    const paragraph = read.document.body[0]!;
    expect(
      paragraph.type === 'paragraph' &&
        paragraph.inlines.filter((i) => i.type === 'kept').map((i) => i.name),
    ).toEqual(['fldChar', 'instrText', 'fldChar', 'fldChar']);
    expect(read.report.dropped).toEqual([
      { reason: 'field', name: 'DDEAUTO', count: 1 },
      { reason: 'field', name: 'INCLUDETEXT', count: 1 },
      { reason: 'field', name: 'DDE', count: 1 },
    ]);
    const table = read.document.body.find((b) => b.type === 'table');
    expect(table && JSON.stringify(table).includes('DDE')).toBe(false);
    const odf = await texts(
      fodt(
        '<text:dde-connection-decls/><text:p>a <text:dde-connection text:connection-name="x">shown</text:dde-connection></text:p><table:table><table:table-column/><table:table-row><table:table-cell><text:p><text:dde-connection>t</text:dde-connection></text:p></table:table-cell></table:table-row></table:table>',
      ),
    );
    expect(odf.texts).toEqual(['a shown', 't']);
    expect(odf.report.dropped.map((d) => d.name)).toEqual([
      'dde-connection-decls',
      'dde-connection',
    ]);
  });

  it('keeps only http, https, mailto and in-document links, keeping the text of any other', async () => {
    const read = await texts(
      docx(
        W_P(
          `<w:hyperlink r:id="rId5">${W_R('bad')}</w:hyperlink><w:hyperlink r:id="rId6">${W_R('good')}</w:hyperlink><w:hyperlink w:anchor="here">${W_R('place')}</w:hyperlink><w:hyperlink r:id="rId404">${W_R('none')}</w:hyperlink>`,
        ),
        {
          rels: `<Relationship Id="rId5" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="javascript:alert(1)" TargetMode="External"/><Relationship Id="rId6" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="https://example.com" TargetMode="External"/>`,
        },
      ),
    );
    const p = read.document.body[0]!;
    expect(
      p.type === 'paragraph' && p.inlines.map((i) => [i.type === 'run' ? i.text : '', i.link]),
    ).toEqual([
      ['bad', undefined],
      ['good', 'https://example.com'],
      ['place', '#here'],
      ['none', undefined],
    ]);
    expect(read.report.dropped).toEqual([{ reason: 'link', name: 'link', count: 1 }]);
    const odf = await texts(
      fodt(
        '<text:p><text:a xlink:href="vbscript:x">t</text:a><text:a xlink:href="file:///etc">u</text:a></text:p>',
      ),
    );
    expect(odf.texts).toEqual(['tu']);
    expect(odf.report.dropped).toEqual([{ reason: 'link', name: 'link', count: 2 }]);
  });

  it('never follows a remote picture, keeping it and saying so', async () => {
    const read = await texts(
      docx(W_P(W_R('x')), {
        rels: `<Relationship Id="rId7" Type="${RELATIONSHIP_TYPES.image}" Target="https://tracker.example/p.png" TargetMode="External"/>`,
      }),
    );
    expect(read.report.dropped).toEqual([{ reason: 'external', name: 'image', count: 1 }]);
    const written = writeTextDocumentFile(read.document, 'docx');
    expect(new TextDecoder().decode(written.bytes).includes('https://tracker.example/p.png')).toBe(
      true,
    );
  });

  it('refuses a picture bomb by its header (picture_too_large)', async () => {
    expect(
      await readTextDocumentFile(
        docx(W_P(''), { entries: [{ name: 'word/media/a.png', data: BOMB }] }),
      ),
    ).toMatchObject({ rejection: 'picture_too_large' });
    expect(
      await readTextDocumentFile(odt('', { entries: [{ name: 'Pictures/a.png', data: BOMB }] })),
    ).toMatchObject({ rejection: 'picture_too_large' });
  });

  it('drops OLE objects, keeping their replacement picture', async () => {
    const read = await texts(
      docx(W_P(W_R('x')), {
        rels: `<Relationship Id="rId8" Type="${RELATIONSHIP_TYPES.oleObject}" Target="embeddings/oleObject1.bin"/>`,
        entries: [{ name: 'word/embeddings/oleObject1.bin', data: 'x' }],
      }),
    );
    expect(read.report.dropped).toEqual([
      { reason: 'ole-object', name: 'word/embeddings/oleObject1.bin', count: 1 },
    ]);
    const odf = await texts(
      fodt(
        '<text:p><draw:frame><draw:object-ole xlink:href="./Object 1"/><draw:image xlink:href="./ObjectReplacements/Object 1"/></draw:frame></text:p>',
      ),
    );
    const frame = odf.document.body[0]!;
    expect(
      frame.type === 'paragraph' && frame.inlines[0]!.type === 'kept' && frame.inlines[0]!.xml.xml,
    ).toBe('<draw:frame><draw:image xlink:href="./ObjectReplacements/Object 1"/></draw:frame>');
    expect(odf.report.dropped).toEqual([{ reason: 'ole-object', name: 'object-ole', count: 1 }]);
  });

  it('refuses a text past the character limit before making a document (document_too_large)', async () => {
    expect(await readTextDocumentFile(fodt('<text:p>12345</text:p>'), { maxChars: 4 })).toEqual({
      ok: false,
      rejection: 'document_too_large',
    });
  });

  it('refuses encrypted packages (package_encrypted)', async () => {
    const manifest =
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>';
    expect(
      await readTextDocumentFile(
        odt('', { entries: [{ name: 'META-INF/manifest.xml', data: manifest }] }),
      ),
    ).toMatchObject({ rejection: 'package_encrypted' });
  });

  it('drops signatures and thumbnails, which an edit would make false', async () => {
    const odf = await texts(
      odt('<text:p>x</text:p>', {
        entries: [
          { name: 'META-INF/documentsignatures.xml', data: '<x/>' },
          { name: 'Thumbnails/thumbnail.png', data: 'x' },
        ],
      }),
    );
    expect(odf.report.dropped.map((d) => d.reason)).toEqual(['signature', 'thumbnail']);
    const word = await texts(
      docx(W_P(''), {
        entries: [
          { name: '_xmlsignatures/sig1.xml', data: '<x/>' },
          { name: 'docProps/thumbnail.jpeg', data: 'x' },
        ],
      }),
    );
    expect(word.report.dropped.map((d) => d.reason)).toEqual(['signature', 'thumbnail']);
  });

  it('keeps no more than the kept-content limit, dropping the rest in reading order and saying so', async () => {
    const read = await readTextDocumentFile(
      fodt(
        '<text:p>a<text:bookmark-start text:name="one"/></text:p><text:p>b<text:bookmark-start text:name="two"/></text:p><text:sequence-decls/>',
      ),
      { keptBytes: 40 },
    );
    expect(read.ok && read.report.dropped).toEqual([
      { reason: 'kept-limit', name: 'kept content', count: 2 },
    ]);
    expect(
      read.ok &&
        read.document.body.map((b) => (b.type === 'paragraph' ? b.inlines.length : b.type)),
    ).toEqual([2, 1]);
  });

  it('opens what is not a text document as nothing (package_wrong_type, package_damaged)', async () => {
    expect(
      await readTextDocumentFile(
        odt('', { mimetype: 'application/vnd.oasis.opendocument.spreadsheet' }),
      ),
    ).toMatchObject({ rejection: 'package_wrong_type' });
    expect(
      await readTextDocumentFile(fodt('', 'application/vnd.oasis.opendocument.spreadsheet')),
    ).toMatchObject({ rejection: 'package_wrong_type' });
    expect(
      await readTextDocumentFile(
        docx('', {
          mainType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
        }),
      ),
    ).toMatchObject({ rejection: 'package_wrong_type' });
    expect(await readTextDocumentFile(new TextEncoder().encode('<html/>'))).toMatchObject({
      rejection: 'package_damaged',
    });
    expect(await readTextDocumentFile(new TextEncoder().encode('<x'))).toMatchObject({
      rejection: 'xml_malformed',
    });
    expect(await readTextDocumentFile(new Uint8Array([1, 2, 3, 4]))).toMatchObject({
      rejection: 'package_damaged',
    });
    expect(await readTextDocumentFile(odt('', { content: '<x/>' }))).toMatchObject({
      rejection: 'package_damaged',
      entry: 'content.xml',
    });
    expect(await readTextDocumentFile(docx('', { entries: [] }).slice(0, 30))).toMatchObject({
      rejection: 'package_damaged',
    });
    const noContent = odt('').slice(0);
    expect((await readTextDocumentFile(noContent)).ok).toBe(true);
    expect(await readTextDocumentFile(fodt('<text:p>').slice(0, 60))).toMatchObject({
      rejection: 'xml_malformed',
    });
  });
});
