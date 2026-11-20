// docs/specs/034-text-documents/live-editing-and-storage.md "The layout": the model lies in the live state one way,
// and reads back as the same model.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';
import { Paragraph, type Run } from '../model/blocks';
import { TextDocument } from '../model/text-document';
import { wholeOf } from '../testing/compare';
import { TextDocumentState } from '../text-document-state';
import { textDocumentDigest } from '../digest';
import { BODY_BLOCKS, KEPT_INLINE, TEXT_PROPERTY_MARKS } from './live-names';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus');
const corpus = ['libreoffice', 'word'].flatMap((maker) =>
  readdirSync(join(CORPUS, maker))
    .filter(
      (f) =>
        /\.(odt|fodt|docx)$/.test(f) && !f.startsWith('encrypted') && !f.endsWith('-source.fodt'),
    )
    .map((f) => join(maker, f)),
);

async function read(file: string): Promise<TextDocument> {
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(join(CORPUS, file))));
  if (!read.ok) throw new Error(`${file}: ${read.rejection}`);
  return read.document;
}

const live = (document: TextDocument) =>
  TextDocumentState.document(
    TextDocumentState.load([TextDocumentState.fromDocument(document)]),
    document.format,
  );

const run = (text: string, props: Run['props'] = {}, extra: Partial<Run> = {}): Run => ({
  type: 'run',
  text,
  props,
  ...extra,
});

describe('the live layout', () => {
  it.each(corpus)(
    'reads %s back as the model it was written from, kept content included',
    async (file) => {
      const document = await read(file);
      expect(wholeOf(live(document))).toBe(wholeOf(document));
    },
  );

  it.each(corpus)('writes %s from the live state as it writes from the model', async (file) => {
    const document = await read(file);
    const type = file.endsWith('.docx') ? 'docx' : file.endsWith('.fodt') ? 'fodt' : 'odt';
    const fromModel = writeTextDocumentFile(document, type);
    const fromState = writeTextDocumentFile(live(document), type);
    expect(fromModel.ok && fromState.ok).toBe(true);
    if (fromModel.ok && fromState.ok) expect(fromState.bytes).toEqual(fromModel.bytes);
  });

  it('keeps a false that overrides a style, and each property apart', () => {
    const blank = TextDocument.blank();
    const paragraph: Paragraph = {
      ...(blank.body[0] as Paragraph),
      inlines: [
        run('plain '),
        run('not bold', { bold: false, size: 14 }),
        run(' linked', { italic: true }, { link: 'https://example.org', style: 'Emphasis' }),
      ],
    };
    const document = { ...blank, body: [paragraph] };
    expect(live(document).body).toEqual(document.body);
  });

  it('reads the seed as a blank text document of the format, metadata and title aside', () => {
    for (const format of ['odf', 'ooxml'] as const) {
      const blank = TextDocument.blank({ format });
      const seed = TextDocumentState.document(TextDocumentState.load(), format);
      expect(wholeOf(seed)).toBe(wholeOf(blank));
    }
  });

  // docs/specs/034-text-documents/links-and-navigation.md "The outline": the outline reads the styles alone.
  it('reads the styles alone, the format defaults while the state holds none', () => {
    const blank = TextDocument.blank({ format: 'ooxml' });
    expect(TextDocumentState.styles(TextDocumentState.load(), 'ooxml')).toEqual(blank.styles);
    const renamed = blank.styles.map((style) => ({ ...style, name: `${style.name}!` }));
    const state = TextDocumentState.load([
      TextDocumentState.fromDocument({ ...blank, styles: renamed }),
    ]);
    expect(TextDocumentState.styles(state, 'ooxml')).toEqual(renamed);
  });

  // text-and-paragraphs.md "Text formatting": a character's formatting through its styles starts at the defaults.
  it('adds a style the state lacks after its others, and nothing while the format set stands', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    const fresh = TextDocumentState.load();
    const quote = {
      id: 'Quote',
      name: 'Quote',
      family: 'paragraph' as const,
      paragraph: {},
      text: {},
    };
    TextDocumentState.addStyle(fresh, quote);
    expect(TextDocumentState.styles(fresh, 'odf')).toEqual(blank.styles);
    const held = TextDocumentState.load([
      TextDocumentState.fromDocument({ ...blank, styles: blank.styles.slice(0, 1) }),
    ]);
    TextDocumentState.addStyle(held, blank.styles[1]!);
    TextDocumentState.addStyle(held, blank.styles[0]!);
    expect(TextDocumentState.styles(held, 'odf')).toEqual(blank.styles.slice(0, 2));
  });

  it('reads the style defaults alone, the format defaults while the state holds none', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    expect(TextDocumentState.defaults(TextDocumentState.load(), 'odf')).toEqual(blank.defaults);
    const defaults = { ...blank.defaults, text: { font: 'Georgia', size: 12 } };
    const state = TextDocumentState.load([TextDocumentState.fromDocument({ ...blank, defaults })]);
    expect(TextDocumentState.defaults(state, 'odf')).toEqual(defaults);
  });

  it('reads a paragraph written without a style, as the tracer wrote them, as Normal text', () => {
    const state = TextDocumentState.load([TextDocumentState.fromBody([{ text: 'Hello' }])]);
    const blank = TextDocument.blank();
    expect(TextDocumentState.document(state, 'odf').body).toEqual([
      { ...(blank.body[0] as Paragraph), inlines: [run('Hello')] },
    ]);
  });

  it('lies blocks, kept inlines and run properties under their layout names', async () => {
    const document = await read('libreoffice/features.odt');
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const names = new Set<string>();
    const marks = new Set<string>();
    const walk = (node: Y.XmlElement | Y.XmlFragment | Y.XmlText) => {
      if (node instanceof Y.XmlText) {
        for (const op of node.toDelta() as { attributes?: object }[])
          for (const key of Object.keys(op.attributes ?? {})) marks.add(key);
        return;
      }
      if (node instanceof Y.XmlElement) names.add(node.nodeName);
      for (const child of node.toArray()) walk(child as Y.XmlElement);
    };
    walk(TextDocumentState.body(doc));
    for (const name of names) expect([...BODY_BLOCKS, KEPT_INLINE]).toContain(name);
    expect(names).toContain('paragraph');
    expect([...marks].some((m) => (TEXT_PROPERTY_MARKS as readonly string[]).includes(m))).toBe(
      true,
    );
  });

  it('still digests a formatted state by its characters', () => {
    const document = TextDocument.fromTexts(['One two', 'three']);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    expect(textDocumentDigest(doc)).toMatchObject({ characters: 12, words: 3 });
  });
});
