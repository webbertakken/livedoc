import { readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conversionLosses } from './convert';
import { docx } from './testing/packages';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { TextDocument, type TextDocumentFormat } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { modelOf } from './testing/compare';
import type { TextDocumentFileType } from './file-types';

const CORPUS = join(import.meta.dirname, '..', 'corpus');

const TYPES: [TextDocumentFormat, TextDocumentFileType][] = [
  ['odf', 'odt'],
  ['odf', 'fodt'],
  ['ooxml', 'docx'],
];

async function roundTrip(document: TextDocument, type: TextDocumentFileType) {
  const written = writeTextDocumentFile(document, type);
  const read = await readTextDocumentFile(written.bytes);
  if (!read.ok) throw new Error(read.rejection);
  return { read, bytes: written.bytes };
}

// docs/specs/034-text-documents/standard-mapping.md "The rule" and "What the model holds": every construct the model
// holds comes back equal, in either format.
describe('every construct, written and read back', () => {
  for (const [format, type] of TYPES)
    for (const [name, build] of Object.entries(CONSTRUCTS))
      it(`keeps ${name} in .${type}`, async () => {
        const document = build(format);
        const { read } = await roundTrip(document, type);
        expect(read.fileType).toBe(type);
        expect(read.document.format).toBe(format);
        expect(modelOf(read.document)).toEqual(modelOf(document));
        expect(read.report).toEqual({ dropped: [], kept: [] });
      });
});

// standard-mapping.md "The flat file": deterministic writing.
describe('writing', () => {
  it('gives the same bytes for the same document, and again after reading it back', async () => {
    for (const [format, type] of TYPES) {
      const document = CONSTRUCTS.lists!(format);
      const first = writeTextDocumentFile(document, type);
      expect(first).toEqual(writeTextDocumentFile(document, type));
      const { read } = await roundTrip(document, type);
      const second = writeTextDocumentFile(read.document, type);
      expect(new TextDecoder().decode(second.bytes)).toBe(new TextDecoder().decode(first.bytes));
    }
  });

  // standard-mapping.md "Conversion": the other format is a converted copy, its losses listed; the document is unchanged.
  it('writes the other format as a converted copy, with what it lost (C1)', async () => {
    const odf = TextDocument.blank();
    const docx = writeTextDocumentFile(odf, 'docx');
    const read = await readTextDocumentFile(docx.bytes);
    expect(read.ok && read.document.format).toBe('ooxml');
    expect(docx.losses).toEqual([]);
    expect(odf.format).toBe('odf');
    const ooxml = TextDocument.blank({ format: 'ooxml' });
    const odt = await readTextDocumentFile(writeTextDocumentFile(ooxml, 'odt').bytes);
    expect(odt.ok && odt.document.format).toBe('odf');
  });

  it('lists the losses of a converted copy, none for its own format', async () => {
    const read = await readTextDocumentFile(readFileSync(join(CORPUS, 'libreoffice/features.odt')));
    if (!read.ok) throw new Error(read.rejection);
    expect(writeTextDocumentFile(read.document, 'odt').losses).toEqual([]);
    expect(writeTextDocumentFile(read.document, 'docx').losses).toEqual(
      conversionLosses(read.document, 'ooxml'),
    );
    expect(writeTextDocumentFile(read.document, 'docx').losses.length).toBeGreaterThan(0);
  });

  it('makes a new document ODF, one empty Normal text paragraph, Google’s styles', () => {
    const blank = TextDocument.blank({ paper: 'a4', title: 'T' });
    expect(blank.format).toBe('odf');
    expect(TextDocument.paragraphTexts(blank)).toEqual(['']);
    expect(blank.metadata).toEqual({ title: 'T' });
    expect(blank.section.setup.width).toBe(595.276);
    expect(TextDocument.fromTexts([]).body).toHaveLength(1);
    expect(TextDocument.characters(TextDocument.fromTexts(['ab', 'c']))).toBe(3);
  });
});

// standard-mapping.md "Documented losses" (Google Docs `.docx`): a package with no core or app properties leaves with
// both, each relationship under an id of its own.
describe('a package written from one lacking its properties', () => {
  it('gives the core and app properties ids no other relationship holds', async () => {
    const read = await readTextDocumentFile(docx('<w:p/>'));
    if (!read.ok) throw new Error(read.rejection);
    const written = writeTextDocumentFile(read.document, 'docx');
    const pkg = await readOoxmlPackage(new Uint8Array(written.bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const root = pkg.package.relationships.get('') ?? [];
    expect(new Set(root.map((r) => r.id)).size).toBe(root.length);
    expect(root.map((r) => r.type)).toEqual(
      expect.arrayContaining([
        RELATIONSHIP_TYPES.coreProperties,
        RELATIONSHIP_TYPES.extendedProperties,
      ]),
    );
  });
});
