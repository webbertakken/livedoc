import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Block, Paragraph } from './model/blocks';
import { ListDefinition } from './model/lists';
import type { TextDocument } from './model/text-document';

const open = async (file: string) => {
  const read = await readTextDocumentFile(
    readFileSync(join(import.meta.dirname, '..', 'corpus', file)),
  );
  if (!read.ok) throw new Error(read.rejection);
  return read;
};

const again = async (document: TextDocument, type: 'odt' | 'fodt' | 'docx') => {
  const written = writeTextDocumentFile(document, type);
  const read = await readTextDocumentFile(written.bytes);
  if (!read.ok) throw new Error(read.rejection);
  return { document: read.document, xml: new TextDecoder('latin1').decode(written.bytes) };
};

const paragraphs = (doc: TextDocument) =>
  doc.body.filter((b): b is Paragraph => b.type === 'paragraph');

/** The document with every paragraph, run, style, list and section edited, as an editor would. */
function edited(doc: TextDocument): TextDocument {
  const body: Block[] = doc.body.map((b) => {
    if (b.type === 'section')
      return { ...b, setup: { ...b.setup, margins: { ...b.setup.margins, left: 90 } } };
    if (b.type !== 'paragraph') return b;
    return {
      ...b,
      props: { ...b.props, spaceAfter: 9 },
      inlines: b.inlines.map((i) =>
        i.type === 'run' ? { ...i, props: { ...i.props, color: '#123456' } } : i,
      ),
    };
  });
  const lists = Object.fromEntries(
    Object.entries(doc.lists).map(([id, l]) => [
      id,
      { ...l, levels: ListDefinition.of('check').levels },
    ]),
  );
  return {
    ...doc,
    defaults: { ...doc.defaults, text: { ...doc.defaults.text, size: 13 } },
    styles: doc.styles.map((s) => ({ ...s, text: { ...s.text, underline: true } })),
    lists,
    section: { ...doc.section, setup: { ...doc.section.setup, orientation: 'landscape' } },
    body: [
      ...body,
      { type: 'section', start: 'next-page', setup: doc.section.setup },
      { type: 'kept', name: 'x', xml: { xml: '<extra:x xmlns:extra="urn:x"/>', ns: {} } },
    ],
  };
}

// docs/specs/034-text-documents/standard-mapping.md "Kept content": kept properties are written back as they were
// while the values read from them hold, and rebuilt from the model, their unmapped children kept, once they change.
describe('a file edited, then written in its own format', () => {
  for (const [file, type] of [
    ['libreoffice/features.odt', 'odt'],
    ['libreoffice/features.fodt', 'fodt'],
    ['libreoffice/features.docx', 'docx'],
    ['word/ComplexNumberedLists.docx', 'docx'],
    ['word/Headers.docx', 'docx'],
  ] as const)
    it(`holds every edit and keeps what the model does not map (${file})`, async () => {
      const read = await open(file);
      const change = edited(read.document);
      const { document } = await again(change, type);
      for (const p of paragraphs(document).slice(0, paragraphs(read.document).length)) {
        expect(p.props.spaceAfter).toBe(9);
        for (const i of p.inlines) if (i.type === 'run') expect(i.props.color).toBe('#123456');
      }
      expect(document.defaults.text.size).toBe(13);
      expect(document.styles.every((s) => s.text.underline === true)).toBe(true);
      expect(document.section.setup.orientation).toBe('landscape');
      for (const list of Object.values(document.lists))
        expect(list.levels.every((l) => l.kind === 'check')).toBe(true);
      const keptBefore = read.document.body.flatMap((b) =>
        b.type === 'kept'
          ? [b.name]
          : b.type === 'paragraph'
            ? b.inlines.filter((i) => i.type === 'kept').map((i) => i.name)
            : [],
      );
      const keptAfter = document.body.flatMap((b) =>
        b.type === 'kept'
          ? [b.name]
          : b.type === 'paragraph'
            ? b.inlines.filter((i) => i.type === 'kept').map((i) => i.name)
            : [],
      );
      expect(keptAfter).toEqual([...keptBefore, 'x']);
      const sections = document.body.filter((b) => b.type === 'section');
      expect(sections.length).toBeGreaterThanOrEqual(
        read.document.body.filter((b) => b.type === 'section').length + 1,
      );
    });

  it('keeps the unmapped children of rebuilt properties: a header’s page layout, a paragraph mark’s formatting', async () => {
    const odf = await again(edited((await open('libreoffice/features.odt')).document), 'odt');
    expect(odf.xml).toContain('header-style');
    const word = await again(edited((await open('libreoffice/features.docx')).document), 'docx');
    expect(word.xml).toContain('w:headerReference');
  });
});
