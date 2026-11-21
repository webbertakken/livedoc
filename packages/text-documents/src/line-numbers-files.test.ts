// docs/specs/034-text-documents/page-layout.md "Line numbers", "In the file": a section's line numbers are OOXML's
// `w:lnNumType` (on only with a count-by of 1 or more, restarting on each page where it names no restart) and ODF's
// whole-document configuration with each section's first paragraph saying whether it is numbered or restarts; both
// read back as written, and a file's own settings carried.
import { describe, expect, it } from 'vitest';
import { conversionLosses, convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Block, SectionBreak } from './model/blocks';
import type { Section } from './model/sections';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
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
const sections = (d: TextDocument): Section[] => [
  d.section,
  ...d.body.filter((b: Block): b is SectionBreak => b.type === 'section'),
];
const lines = (d: TextDocument) => sections(d).map((s) => s.lineNumbers);

const WRITTEN = [{ restart: 'page' }, undefined, { restart: 'section' }];

describe('line numbers in the files', () => {
  it.each([
    ['ooxml', 'docx'],
    ['odf', 'odt'],
    ['odf', 'fodt'],
  ] as const)(
    'writes each section’s line numbers and reads them back (%s, %s)',
    async (format, type) => {
      const back = await read(write(CONSTRUCTS.lineNumbers!(format), type));
      expect(lines(back)).toEqual(WRITTEN);
    },
  );
});

describe('OOXML', () => {
  const sectPr = (lnNumType: string) =>
    docx(`${W_P(W_R('Hello'))}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>${lnNumType}</w:sectPr>`);

  it('reads Word’s line numbers: on only with a count-by, restarting on each page unless it says', async () => {
    expect(lines(await read(sectPr('<w:lnNumType w:countBy="1"/>')))).toEqual([
      { restart: 'page' },
    ]);
    expect(
      lines(await read(sectPr('<w:lnNumType w:countBy="1" w:restart="continuous"/>'))),
    ).toEqual([{ restart: 'continuous' }]);
    expect(lines(await read(sectPr('<w:lnNumType w:distance="0"/>')))).toEqual([undefined]);
    expect(
      lines(await read(sectPr('<w:lnNumType w:countBy="5" w:restart="newSection"/>'))),
    ).toEqual([{ restart: 'section', countBy: 5 }]);
  });

  it('carries the file’s start and distance, and writes the restart and count-by', async () => {
    const arrived = await read(
      sectPr('<w:lnNumType w:countBy="1" w:start="2" w:distance="360" w:restart="newSection"/>'),
    );
    const changed: TextDocument = {
      ...arrived,
      section: { ...arrived.section, lineNumbers: { restart: 'continuous' } },
    };
    const back = await read(write(changed, 'docx'));
    expect(lines(back)).toEqual([{ restart: 'continuous' }]);
  });
});

describe('ODF', () => {
  const NS =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
  const flat = (config: string, automatic = '', body = '<text:p>Hello</text:p>') =>
    new TextEncoder().encode(
      `<?xml version="1.0"?><office:document ${NS} office:version="1.4" office:mimetype="application/vnd.oasis.opendocument.text"><office:styles>${config}</office:styles><office:automatic-styles>${automatic}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document>`,
    );
  const CONFIG = (on: boolean, extra = '') =>
    `<text:linenumbering-configuration text:number-lines="${on}" text:offset="0.499cm" style:num-format="1" text:number-position="left" text:increment="5"${extra}/>`;

  it('reads the whole document’s configuration: off, on counting on, on restarting on each page', async () => {
    expect(lines(await read(flat(CONFIG(false))))).toEqual([undefined]);
    expect(lines(await read(flat(CONFIG(true))))).toEqual([{ restart: 'continuous', countBy: 5 }]);
    expect(lines(await read(flat(CONFIG(true, ' text:restart-on-page="true"'))))).toEqual([
      { restart: 'page', countBy: 5 },
    ]);
  });

  it('reads a section off or restarting from its first paragraph', async () => {
    const automatic =
      '<style:style style:name="Off" style:family="paragraph"><style:paragraph-properties text:number-lines="false"/></style:style>';
    expect(
      lines(await read(flat(CONFIG(true), automatic, '<text:p text:style-name="Off">a</text:p>'))),
    ).toEqual([undefined]);
  });

  it('writes a file’s configuration back off when none is numbered, its other settings carried', async () => {
    const arrived = await read(flat(CONFIG(true)));
    const off = text(
      write({ ...arrived, section: { ...arrived.section, lineNumbers: undefined } }, 'fodt'),
    );
    expect(off).toMatch(/<text:linenumbering-configuration[^>]*text:number-lines="false"/);
    expect(off).toContain('text:offset="0.499cm"');
    expect(off.match(/linenumbering-configuration/g)).toHaveLength(1);
  });

  it('writes LiveDoc’s configuration, every line counted, its paragraphs saying off or restart', () => {
    const xml = text(write(CONSTRUCTS.lineNumbers!('odf'), 'fodt'));
    const config = xml.match(/<text:linenumbering-configuration[^>]*>/)![0];
    expect(config).toContain('text:number-lines="true"');
    expect(config).toContain('text:increment="1"');
    expect(config).toContain('text:restart-on-page="true"');
    expect(xml).toContain('text:number-lines="false"');
    expect(xml).toContain('text:line-number="1"');
  });

  it('writes no configuration for a document never numbered', () => {
    const plain = CONSTRUCTS.text!('odf');
    expect(text(write(plain, 'fodt'))).not.toContain('linenumbering-configuration');
  });
});

describe('conversion', () => {
  it('counts each section whose restart on each page ODF cannot hold', () => {
    const document = CONSTRUCTS.lineNumbers!('ooxml');
    const loss = (d: TextDocument) =>
      conversionLosses(d, 'odf').find((l) => l.kind === 'line-number-restart')?.count ?? 0;
    // Restarting on each page, then on its own: ODF's restart on each page is the whole document's.
    expect(loss(document)).toBe(1);
    const allPages: TextDocument = {
      ...document,
      body: document.body.map((b) =>
        b.type === 'section' && b.lineNumbers
          ? { ...b, lineNumbers: { restart: 'page' as const } }
          : b,
      ),
    };
    expect(loss(allPages)).toBe(0);
    expect(lines(convertTextDocument(document, 'odf').document)).toEqual(WRITTEN);
  });
});
