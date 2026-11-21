import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conversionLosses, convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { Styles } from './model/styles';
import { TextDocument } from './model/text-document';
import { modelOf } from './testing/compare';
import { CONSTRUCTS } from './testing/constructs';

const corpus = async (file: string) => {
  const read = await readTextDocumentFile(
    readFileSync(join(import.meta.dirname, '..', 'corpus', file)),
  );
  if (!read.ok) throw new Error(read.rejection);
  return read.document;
};

// docs/specs/034-text-documents/standard-mapping.md "Conversion" and "Documented losses".
describe('conversion', () => {
  it('lists the losses before anything changes: kept content by name and count, and what the other format lacks', async () => {
    const features = await corpus('libreoffice/features.odt');
    const losses = conversionLosses(features, 'ooxml');
    expect(losses).toContainEqual({ kind: 'kept', name: 'table', count: 1 });
    expect(losses).toContainEqual({ kind: 'kept', name: 'note', count: 1 });
    expect(losses).toContainEqual({ kind: 'section-name', name: 'section-name', count: 1 });
    expect(losses).toContainEqual({ kind: 'list-header', name: 'list-header', count: 1 });
    const lists = CONSTRUCTS.lists!('odf');
    expect(conversionLosses(lists, 'ooxml')).toEqual([
      { kind: 'list-header', name: 'list-header', count: 1 },
    ]);
    expect(conversionLosses(CONSTRUCTS.text!('odf'), 'ooxml')).toEqual([
      { kind: 'text-transform', name: 'text-transform', count: 2 },
    ]);
    expect(conversionLosses(await corpus('word/VariousPictures.docx'), 'odf')).toEqual([
      { kind: 'kept', name: 'drawing', count: 5 },
      { kind: 'kept', name: 'word', count: 9 },
    ]);
  });

  it("lists the line between paragraphs going to ODF, and padding past Word's most going to OOXML, then drops or holds them", async () => {
    const word = CONSTRUCTS.borders!('ooxml');
    expect(conversionLosses(word, 'odf')).toEqual([{ kind: 'between', name: 'between', count: 1 }]);
    const odf = convertTextDocument(word, 'odf').document;
    const ruled = odf.body[1]!;
    expect(ruled.type === 'paragraph' && Object.keys(ruled.props.borders!)).toEqual([
      'top',
      'bottom',
    ]);

    const wide = CONSTRUCTS.borders!('odf');
    const boxed = wide.body[0]!;
    if (boxed.type !== 'paragraph') throw new Error('fixture');
    const padded: TextDocument = {
      ...wide,
      body: [
        {
          ...boxed,
          props: {
            ...boxed.props,
            borders: { top: { width: 1.3, dash: 'solid', color: '#000000', space: 40 } },
          },
        },
      ],
    };
    expect(conversionLosses(padded, 'ooxml')).toEqual([
      { kind: 'border-padding', name: 'border-padding', count: 1 },
    ]);
    const converted = convertTextDocument(padded, 'ooxml').document;
    const written = writeTextDocumentFile(converted, 'docx');
    if (!written.ok) throw new Error(written.rejection);
    const read = await readTextDocumentFile(written.bytes);
    if (!read.ok) throw new Error(read.rejection);
    expect(modelOf(read.document)).toEqual(modelOf(converted));
    const top =
      converted.body[0]!.type === 'paragraph' ? converted.body[0]!.props.borders!.top : null;
    expect(top).toEqual({ width: 1.25, dash: 'solid', color: '#000000', space: 31 });
  });

  it('changes nothing for the format a document is already in', () => {
    const doc = TextDocument.blank();
    expect(convertTextDocument(doc, 'odf')).toEqual({ document: doc, losses: [] });
  });

  for (const [from, to, type] of [
    ['odf', 'ooxml', 'docx'],
    ['ooxml', 'odf', 'odt'],
  ] as const)
    for (const name of ['text', 'paragraphs', 'styles', 'lists', 'sections', 'links', 'metadata'])
      it(`converts ${name} from ${from} to ${to}, holding the same model in the other format`, async () => {
        const { document } = convertTextDocument(CONSTRUCTS[name]!(from), to);
        expect(document.format).toBe(to);
        expect(document.source).toBeUndefined();
        const written = writeTextDocumentFile(document, type);
        const read = written.ok ? await readTextDocumentFile(written.bytes) : undefined;
        expect(read?.ok && modelOf(read.document)).toEqual(modelOf(document));
      });

  it('maps built-in styles to the other format’s ids, and folds ODF paragraph text formatting into runs', () => {
    const odf = CONSTRUCTS.text!('odf');
    const { document } = convertTextDocument(odf, 'ooxml');
    expect(document.styles.map((s) => s.id)).toEqual(Styles.builtIn('ooxml').map((s) => s.id));
    const last = document.body.at(-1)!;
    expect(last.type === 'paragraph' && last.text).toBeUndefined();
    expect(last.type === 'paragraph' && last.inlines.every((i) => i.props.italic === true)).toBe(
      true,
    );
  });

  it('drops kept content and what came from the old file', async () => {
    const { document } = convertTextDocument(await corpus('libreoffice/features.odt'), 'ooxml');
    expect(document.body.some((b) => b.type === 'kept')).toBe(false);
    expect(JSON.stringify(document)).not.toContain('"kept"');
    const written = writeTextDocumentFile(document, 'docx');
    expect(written.ok && (await readTextDocumentFile(written.bytes)).ok).toBe(true);
  });

  // page-layout.md "Headers and footers": converted as the body is; an OpenDocument file does not hold them yet.
  it('converts headers and footers as the body, listing each as a loss going to ODF', () => {
    const word = CONSTRUCTS.headers!('ooxml');
    expect(conversionLosses(word, 'odf')).toEqual([
      { kind: 'header-footer', name: 'header-footer', count: 5 },
    ]);
    const odf = CONSTRUCTS.headers!('odf');
    const { document } = convertTextDocument(odf, 'ooxml');
    const header = document.section.headers!.header!.default!.blocks[0]!;
    expect(header.type === 'paragraph' && header.style).toBe(
      Styles.idOfRole(Styles.builtIn('ooxml'), 'normal'),
    );
    expect(document.section.setup.margins).toMatchObject({ header: 24, footer: 30 });
    expect(document.section.headers).toMatchObject({
      differentFirst: true,
      differentOddEven: true,
    });
    const later = document.body.find((b) => b.type === 'section');
    expect(later?.type === 'section' && later.headers?.header?.default).toBeTruthy();
  });
});
