import { describe, expect, it } from 'vitest';
import { readOdfPackage, writeOdfPackage } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';
import { Body } from './body';
import { isTextDocumentFileType } from './file-types';
import { odfParagraphContent, readOdfText, writeFodt, writeOdt } from './odf-text';

const TEXT = 'application/vnd.oasis.opendocument.text';
const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
};
const content = (inner: string) =>
  `<office:document-content xmlns:office="${NS.office}" xmlns:text="${NS.text}" xmlns:draw="${NS.draw}"><office:body><office:text>${inner}</office:text></office:body></office:document-content>`;
const odtWith = (contentXml: string) =>
  writeTestZip([
    { name: 'mimetype', data: TEXT },
    { name: 'content.xml', data: contentXml },
  ]);

// docs/specs/034-text-documents/standard-mapping.md "The rule": a file opened and saved gives the same document.
describe('the ODF text mapping', () => {
  it('reads back what it writes, spaces, tabs and line breaks included', async () => {
    const body = Body.of(
      'Hello, world',
      '  two  leading',
      'tab\there',
      'line\nbreak',
      'end ',
      '',
      '<&>"',
    );
    for (const bytes of [writeOdt(body, 'Report'), writeFodt(body, 'Report')]) {
      const read = await readOdfText(bytes);
      expect(read.ok && read.body).toEqual(body);
    }
  });

  it('writes the same bytes for the same document', () => {
    expect(writeOdt(Body.of('a'), 'T')).toEqual(writeOdt(Body.of('a'), 'T'));
  });

  it('writes an empty body as one empty paragraph', async () => {
    const read = await readOdfText(writeOdt([], 'Empty'));
    expect(read.ok && read.body).toEqual(Body.of(''));
    const flat = await readOdfText(writeFodt([], 'Empty'));
    expect(flat.ok && flat.body).toEqual(Body.of(''));
  });

  it('declares ODF 1.4 and names the document in its metadata', async () => {
    const read = await readOdfPackage(writeOdt(Body.of('a'), 'Q3 & more'));
    const meta = read.ok ? new TextDecoder().decode(read.package.entries.get('meta.xml')) : '';
    expect(meta).toContain('office:version="1.4"');
    expect(meta).toContain('<dc:title>Q3 &amp; more</dc:title>');
  });

  it('keeps a space only where white-space processing would', () => {
    expect(odfParagraphContent('a b')).toBe('a b');
    expect(odfParagraphContent('a   b')).toBe('a <text:s text:c="2"/>b');
    expect(odfParagraphContent(' a ')).toBe('<text:s/>a<text:s/>');
    expect(odfParagraphContent('  ')).toBe('<text:s text:c="2"/>');
  });

  // ODF 1.4 part 3, "White-space characters".
  it('collapses white space in markup as ODF says', async () => {
    const read = await readOdfText(
      odtWith(
        content(
          '<text:p>\n  a \t\r\n b<text:span> c</text:span><text:s text:c="3"/>d<text:s text:c="x"/>e</text:p>',
        ),
      ),
    );
    expect(read.ok && read.body).toEqual(Body.of('a b c   d e'));
  });

  it('reads paragraphs and headings through sections and lists, skipping what it does not hold yet', async () => {
    const read = await readOdfText(
      odtWith(
        content(
          '<text:sequence-decls/><text:h>Title</text:h><text:section><text:p>In section</text:p></text:section>' +
            '<text:list><text:list-header><text:p>Header</text:p></text:list-header><text:list-item><text:p>Item</text:p></text:list-item></text:list>' +
            '<text:p>Note<text:note><text:note-body><text:p>hidden</text:p></text:note-body></text:note>' +
            '<office:annotation><text:p>comment</text:p></office:annotation><office:annotation-end/><draw:frame/></text:p>',
        ),
      ),
    );
    expect(read.ok && read.body).toEqual(Body.of('Title', 'In section', 'Header', 'Item', 'Note'));
  });

  it('refuses another kind of document, a damaged one, and a DOCTYPE', async () => {
    const sheet = writeTestZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
    ]);
    expect(await readOdfText(sheet)).toEqual({ ok: false, rejection: 'package_wrong_type' });
    expect(await readOdfText(writeTestZip([{ name: 'mimetype', data: TEXT }]))).toMatchObject({
      rejection: 'package_damaged',
      entry: 'content.xml',
    });
    expect(await readOdfText(odtWith('<x/>'))).toMatchObject({ rejection: 'package_damaged' });
    expect(await readOdfText(odtWith('<x'))).toMatchObject({ rejection: 'xml_malformed' });
    expect(await readOdfText(new TextEncoder().encode('nope'))).toMatchObject({
      rejection: 'package_damaged',
    });
    const bytes = writeOdfPackage(TEXT, []);
    expect(await readOdfText(bytes)).toMatchObject({ rejection: 'package_damaged' });
  });

  it('refuses flat files that are not ODF text', async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(await readOdfText(enc('<!DOCTYPE x><x/>'))).toMatchObject({
      rejection: 'xml_doctype_refused',
    });
    expect(await readOdfText(enc('<x/>'))).toMatchObject({ rejection: 'package_damaged' });
    const doc = (type: string, inner = '') =>
      enc(
        `<office:document xmlns:office="${NS.office}" office:mimetype="${type}">${inner}</office:document>`,
      );
    expect(await readOdfText(doc('application/vnd.oasis.opendocument.spreadsheet'))).toMatchObject({
      rejection: 'package_wrong_type',
    });
    expect(await readOdfText(doc(TEXT))).toMatchObject({ rejection: 'package_damaged' });
  });

  it('reports what the package dropped', async () => {
    const bytes = writeTestZip([
      { name: 'mimetype', data: TEXT },
      { name: 'content.xml', data: content('<text:p>a</text:p>') },
      { name: 'Basic/script.xml', data: 'x' },
    ]);
    const read = await readOdfText(bytes);
    expect(read.ok && read.dropped).toEqual(['Basic/script.xml']);
  });
});

describe('isTextDocumentFileType', () => {
  it('knows the files a text document leaves as', () => {
    expect(isTextDocumentFileType('odt')).toBe(true);
    expect(isTextDocumentFileType('pdf')).toBe(false);
  });
});
