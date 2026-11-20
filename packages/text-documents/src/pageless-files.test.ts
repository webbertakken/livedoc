// docs/specs/034-text-documents/standard-mapping.md "Extensions" (Pageless), page-layout.md "Pageless": pageless is
// written in either format's settings and read back; an arriving file's settings stay as they came while it is not
// changed, and turning it off takes LiveDoc's mark away.
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { TextDocument } from './model/text-document';
import { docx, W_P, W_R } from './testing/packages';

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const OTHER_SET =
  '<config:config-item-set config:name="ooo:view-settings"><config:config-item config:name="ViewAreaTop" config:type="long">0</config:config-item></config:config-item-set>';
const PAGELESS_SET =
  '<config:config-item-set config:name="livedoc:settings"><config:config-item config:name="livedoc:pageless" config:type="boolean">true</config:config-item></config:config-item-set>';
const flat = (settings: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.text">${settings}<office:body><office:text><text:p>Hello</text:p></office:text></office:body></office:document>`,
  );

describe('pageless in ODF', () => {
  it.each(['odt', 'fodt'] as const)(
    'writes a new pageless document and reads it back (%s)',
    async (type) => {
      const pageless = { ...TextDocument.fromTexts(['Hello']), pageless: true as const };
      const back = await read(write(pageless, type));
      expect(back.pageless).toBe(true);
      expect((await read(write(TextDocument.fromTexts(['Hello']), type))).pageless).toBeUndefined();
    },
  );

  it('keeps the tab setting beside it in a new document', () => {
    const xml = text(write({ ...TextDocument.fromTexts(['a']), pageless: true }, 'fodt'));
    expect(xml).toContain('config:name="TabsRelativeToIndent"');
    expect(xml).toContain('config:name="livedoc:pageless" config:type="boolean">true<');
  });

  it("reads an arriving file's set, keeps its other settings, and leaves the set out when switched to pages", async () => {
    const arrived = await read(
      flat(`<office:settings>${OTHER_SET}${PAGELESS_SET}</office:settings>`),
    );
    expect(arrived.pageless).toBe(true);
    const again = text(write(arrived, 'fodt'));
    expect(again).toContain('ViewAreaTop');
    expect(again.match(/livedoc:pageless/g)).toHaveLength(1);
    const { pageless: _on, ...pages } = arrived;
    const off = text(write(pages, 'fodt'));
    expect(off).toContain('ViewAreaTop');
    expect(off).not.toContain('livedoc:pageless');
  });

  it("adds the set to an arriving file's settings, or to a file that had none", async () => {
    const withSettings = await read(flat(`<office:settings>${OTHER_SET}</office:settings>`));
    expect(withSettings.pageless).toBeUndefined();
    const on = await read(write({ ...withSettings, pageless: true }, 'fodt'));
    expect(on.pageless).toBe(true);
    const none = await read(flat(''));
    expect((await read(write({ ...none, pageless: true }, 'odt'))).pageless).toBe(true);
  });

  it('reads a set whose item is false as pages', async () => {
    const off = PAGELESS_SET.replace('>true<', '>false<');
    expect(
      (await read(flat(`<office:settings>${off}</office:settings>`))).pageless,
    ).toBeUndefined();
  });
});

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const LIVEDOC = 'urn:livedoc:xmlns:text:1.0';
const wordFile = (settings: string, rootExtra = '') =>
  docx(W_P(W_R('Hello')), {
    rels: `<Relationship Id="rId11" Type="${RELATIONSHIP_TYPES.settings}" Target="settings.xml"/>`,
    entries: [
      {
        name: 'word/settings.xml',
        data: `<?xml version="1.0"?><w:settings xmlns:w="${W}"${rootExtra}>${settings}</w:settings>`,
      },
    ],
  });

describe('pageless in OOXML', () => {
  it('writes a new pageless Word file, marked ignorable, and reads it back', async () => {
    const bytes = write(
      { ...TextDocument.fromTexts(['Hello'], { format: 'ooxml' }), pageless: true },
      'docx',
    );
    expect((await read(bytes)).pageless).toBe(true);
    expect(
      (await read(write(TextDocument.fromTexts(['Hello'], { format: 'ooxml' }), 'docx'))).pageless,
    ).toBeUndefined();
  });

  it("keeps an arriving file's settings as they came while pageless is unchanged", async () => {
    const settings = '<w:zoom w:percent="120"/><w:defaultTabStop w:val="720"/>';
    const arrived = await read(wordFile(settings));
    const back = await read(write(arrived, 'docx'));
    expect(back.pageless).toBeUndefined();
    expect(back.source && 'parts' in back.source).toBe(true);
  });

  it('marks an arriving file pageless keeping its settings, and takes the mark away again', async () => {
    const arrived = await read(wordFile('<w:zoom w:percent="120"/>'));
    const on = await read(write({ ...arrived, pageless: true }, 'docx'));
    expect(on.pageless).toBe(true);
    const { pageless: _on, ...pages } = on;
    const off = await read(write(pages, 'docx'));
    expect(off.pageless).toBeUndefined();
  });

  it('reads the mark in a file that declares the namespace under another prefix', async () => {
    const arrived = await read(
      wordFile(
        '<ld:pageless/>',
        ` xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:ld="${LIVEDOC}" mc:Ignorable="ld"`,
      ),
    );
    expect(arrived.pageless).toBe(true);
  });
});
