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
      { kind: 'restart', name: 'restart', count: 1 },
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
});
