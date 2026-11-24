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
import {
  BODY_BLOCKS,
  DOCUMENT_MAP,
  FIELD,
  FOOTNOTE,
  BOOKMARK,
  MEDIA_MAP,
  EQUATION,
  PICTURE,
  KEPT_BLOCK,
  KEPT_INLINE,
  TABLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_PARTS,
  TABLE_ROW,
  TEXT_PROPERTY_MARKS,
} from './live-names';
import { liveNoteIds, liveStoryIds, storyFragment } from './live-stories';
import { CONSTRUCTS } from '../testing/constructs';
import { BLUE_PNG_SHA, GREEN_PNG_SHA } from '../testing/pictures';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus');
const corpus = ['libreoffice', 'word', 'google'].flatMap((maker) =>
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

  // text-and-paragraphs.md "Update to match", "Default styles": styles set, the format's set first while it stands.
  it('sets styles by id, writing the format set first while the state holds none', () => {
    const blank = TextDocument.blank({ format: 'ooxml' });
    const state = TextDocumentState.load();
    const h1 = { ...blank.styles[3]!, text: { size: 30 } };
    const origins: unknown[] = [];
    state.on('afterTransaction', (tr: Y.Transaction) => origins.push(tr.origin));
    TextDocumentState.setStyles(state, 'ooxml', [h1], 'restyle');
    expect(TextDocumentState.styles(state, 'ooxml')).toEqual(
      blank.styles.map((s) => (s.id === h1.id ? h1 : s)),
    );
    expect(origins).toEqual(['restyle']);
    const quote = {
      id: 'Quote',
      name: 'Quote',
      family: 'paragraph' as const,
      paragraph: {},
      text: {},
    };
    TextDocumentState.setStyles(state, 'ooxml', [quote]);
    expect(TextDocumentState.styles(state, 'ooxml').at(-1)).toEqual(quote);
    expect(TextDocumentState.stylesType(state).size).toBe(blank.styles.length + 1);
  });

  it('sets no styles for an empty change, leaving the format set standing', () => {
    const state = TextDocumentState.load();
    TextDocumentState.setStyles(state, 'odf', []);
    expect(TextDocumentState.stylesType(state).size).toBe(0);
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
    for (const name of names)
      expect([...BODY_BLOCKS, ...TABLE_PARTS, KEPT_INLINE, FOOTNOTE, BOOKMARK]).toContain(name);
    expect(names).toContain('paragraph');
    expect([...marks].some((m) => (TEXT_PROPERTY_MARKS as readonly string[]).includes(m))).toBe(
      true,
    );
  });

  // page-layout.md "Page numbers": fields as atoms of their own, each section's start at kept.
  it.each(['odf', 'ooxml'] as const)(
    'reads fields and sections’ starts back as written (%s)',
    (format) => {
      const document = CONSTRUCTS.fields!(format);
      expect(wholeOf(live(document))).toBe(wholeOf(document));
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
      const first = TextDocumentState.body(doc).get(0) as Y.XmlElement;
      expect(first.toArray().map((n) => (n instanceof Y.XmlElement ? n.nodeName : 'text'))).toEqual(
        ['text', FIELD],
      );
    },
  );

  // page-layout.md "Footnotes": a mark an atom of its own naming its note's fragment; the note's text is searched.
  it.each(['odf', 'ooxml'] as const)('reads footnotes back as written (%s)', (format) => {
    const document = CONSTRUCTS.footnotes!(format);
    expect(wholeOf(live(document))).toBe(wholeOf(document));
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const first = TextDocumentState.body(doc).get(0) as Y.XmlElement;
    const marks = first
      .toArray()
      .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement && n.nodeName === FOOTNOTE);
    expect(marks.map((m) => m.getAttribute('story'))).toEqual(liveNoteIds(doc));
    expect(liveStoryIds(doc)).toEqual(liveNoteIds(doc));
    const texts = liveNoteIds(doc).map((id) =>
      TextDocumentState.storyParagraphs(doc, id).map((p) => p.text),
    );
    expect(texts).toEqual([['The source.'], ['Bold, and a link', 'A second paragraph.']]);
    expect(textDocumentDigest(doc).searchText).toContain('A second paragraph.');
  });

  // tables.md "In the editor": a table's rows of cells as elements, header rows' cells as header cells, each cell's
  // blocks as the body's; its notes' marks counted in reading order, its text searched.
  it.each(['odf', 'ooxml'] as const)('lays a table out as rows of cells (%s)', (format) => {
    const document = CONSTRUCTS.tables!(format);
    expect(wholeOf(live(document))).toBe(wholeOf(document));
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const table = TextDocumentState.body(doc).get(1) as Y.XmlElement;
    expect(table.nodeName).toBe(TABLE);
    const rows = table.toArray() as Y.XmlElement[];
    expect(rows.map((r) => r.nodeName)).toEqual([TABLE_ROW, TABLE_ROW, TABLE_ROW]);
    const cells = rows.map((r) => (r.toArray() as Y.XmlElement[]).map((c) => c.nodeName));
    expect(cells).toEqual([
      [TABLE_HEADER, TABLE_HEADER, TABLE_HEADER],
      [TABLE_CELL, TABLE_CELL],
      [TABLE_CELL, TABLE_CELL],
    ]);
    const across = (rows[1]!.toArray() as Y.XmlElement[])[0]!;
    expect([across.getAttribute('colspan'), across.getAttribute('colwidth')]).toEqual([
      2,
      [144, 108],
    ]);
    expect(liveNoteIds(doc)).toHaveLength(1);
    const digest = textDocumentDigest(doc);
    expect(digest.searchText).toContain('Across two');
    expect(digest.searchText).toContain('n4');
    expect(digest.searchText).toContain('In a cell.');
  });

  // objects.md "In the editor": a picture an atom of its own, its media once in the root map `media` by key; a body
  // holding only a picture has content.
  it.each(['odf', 'ooxml'] as const)(
    'reads pictures and their media back as written (%s)',
    (format) => {
      const document = CONSTRUCTS.pictures!(format);
      expect(wholeOf(live(document))).toBe(wholeOf(document));
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
      const first = TextDocumentState.body(doc).get(0) as Y.XmlElement;
      expect(first.toArray().map((n) => (n instanceof Y.XmlElement ? n.nodeName : 'text'))).toEqual(
        ['text', PICTURE, 'text', PICTURE, 'text'],
      );
      expect([...doc.getMap(MEDIA_MAP).keys()].sort()).toEqual(
        [BLUE_PNG_SHA, GREEN_PNG_SHA].sort(),
      );
      const only = {
        ...document,
        body: [document.body[1]!],
        section: TextDocument.blank({ format }).section,
      };
      const alone = TextDocumentState.load([TextDocumentState.fromDocument(only)]);
      expect(textDocumentDigest(alone)).toMatchObject({ characters: 0, hasContent: true });
    },
  );

  // objects.md "Drawings": a drawing's picture names its drawing tab, kept through the live state.
  it('reads a drawing’s picture back with its drawing tab', () => {
    const document = CONSTRUCTS.pictures!('odf');
    const first = document.body[0]! as Paragraph;
    const drawn = {
      ...document,
      body: [
        {
          ...first,
          inlines: first.inlines.map((inline) =>
            inline.type === 'picture' ? { ...inline, drawing: 'tab-d1' } : inline,
          ),
        },
      ],
    };
    const back = live(drawn).body[0] as Paragraph;
    expect(back.inlines.filter((i) => i.type === 'picture').map((i) => i.drawing)).toEqual([
      'tab-d1',
      'tab-d1',
    ]);
  });

  // objects.md "Equations in the editor": an equation an atom of its own, its maths one whole value; maths the model
  // cannot hold read as an empty equation; a body holding only an equation has content.
  it.each(['odf', 'ooxml'] as const)('reads equations back as written (%s)', (format) => {
    const document = CONSTRUCTS.equations!(format);
    expect(wholeOf(live(document))).toBe(wholeOf(document));
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const body = TextDocumentState.body(doc);
    const first = body.get(0) as Y.XmlElement;
    expect(first.toArray().map((n) => (n instanceof Y.XmlElement ? n.nodeName : 'text'))).toEqual([
      'text',
      EQUATION,
      'text',
    ]);
    const only = { ...document, body: [document.body[1]!] };
    const alone = TextDocumentState.load([TextDocumentState.fromDocument(only)]);
    expect(textDocumentDigest(alone)).toMatchObject({ characters: 0, hasContent: true });
    ((body.get(1) as Y.XmlElement).get(0) as Y.XmlElement).setAttribute('math', [
      { kind: 'matrix' },
    ] as never);
    const back = TextDocumentState.document(doc, format);
    const second = back.body[1]!;
    expect(second.type === 'paragraph' && second.inlines).toEqual([
      { type: 'equation', math: [], props: {} },
    ]);
  });

  it('makes a table merged edits left uneven whole, drops one with no rows, and gives a column without a width one', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(CONSTRUCTS.tables!('odf'))]);
    const body = TextDocumentState.body(doc);
    const table = body.get(1) as Y.XmlElement;
    const rows = table.toArray() as Y.XmlElement[];
    doc.transact(() => {
      (rows[0]!.get(0) as Y.XmlElement).removeAttribute('colwidth');
      rows[0]!.delete(2, 1);
      body.insert(2, [new Y.XmlElement(TABLE)]);
    });
    const read = TextDocumentState.document(doc, 'odf');
    const held = read.body.filter((b) => b.type === 'table');
    expect(held).toHaveLength(1);
    const only = held[0]!;
    // The first row's widths stand; a column it lost is widened back by the average (tables.md "In the formats").
    expect(only.type === 'table' && only.columns).toEqual([72, 108, 90]);
    expect(only.type === 'table' && only.rows[0]!.cells).toHaveLength(3);
  });

  it('reads a table held whole in a kept block, as documents imported while tables were not drawn hold one', () => {
    const document = CONSTRUCTS.tables!('odf');
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const body = TextDocumentState.body(doc);
    const held = new Y.XmlElement(KEPT_BLOCK);
    held.setAttribute('name', 'table');
    held.setAttribute('table', JSON.parse(JSON.stringify(document.body[1])) as string);
    doc.transact(() => {
      body.delete(1, 1);
      body.insert(1, [held]);
    });
    expect(wholeOf(TextDocumentState.document(doc, 'odf'))).toBe(wholeOf(document));
  });

  // page-layout.md "Line numbers": each section's, the first's in the document map, the others' on their breaks.
  it.each(['odf', 'ooxml'] as const)('reads line numbers back as written (%s)', (format) => {
    const document = CONSTRUCTS.lineNumbers!(format);
    expect(wholeOf(live(document))).toBe(wholeOf(document));
  });

  it('still digests a formatted state by its characters', () => {
    const document = TextDocument.fromTexts(['One two', 'three']);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    expect(textDocumentDigest(doc)).toMatchObject({ characters: 12, words: 3 });
  });

  // "The layout": each header and footer a fragment of its own, a section naming it by id.
  describe('headers and footers', () => {
    const headed = () => {
      const document = CONSTRUCTS.headers!('ooxml');
      const shared = document.section.headers!.header!.default!;
      // A header two sections share, as a file read it, is one fragment.
      const body = document.body.map((b) =>
        b.type === 'section' ? { ...b, headers: { header: { default: shared } } } : b,
      );
      return { ...document, body };
    };

    it('reads back the headers and footers it was written with', () => {
      const document = headed();
      expect(wholeOf(live(document))).toBe(wholeOf(document));
    });

    it('lies each in a story fragment, a shared one once, the sections naming them', () => {
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(headed())]);
      const meta = doc.getMap<unknown>(DOCUMENT_MAP).get('section') as {
        headers: { header: { default: { story: string } } };
      };
      const id = meta.headers.header.default.story;
      expect(storyFragment(doc, id).toJSON()).toContain('Header');
      const later = doc.getXmlFragment('body').toArray()[1] as Y.XmlElement;
      expect(later.getAttribute('headers')).toMatchObject({ header: { default: { story: id } } });
      const read = live(headed());
      const breakHeaders = read.body.find((b) => b.type === 'section');
      expect(breakHeaders?.type === 'section' && breakHeaders.headers?.header?.default).toBe(
        read.section.headers!.header!.default,
      );
    });

    it('reads a fragment as its blocks alone, and passes over a slot naming none', () => {
      const doc = new Y.Doc();
      const fragment = storyFragment(doc, 'x');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('Kept')]);
      fragment.insert(0, [new Y.XmlText('stray'), new Y.XmlElement('unknown'), paragraph]);
      doc.getMap<unknown>(DOCUMENT_MAP).set('section', {
        start: 'next-page',
        setup: TextDocument.blank().section.setup,
        headers: { header: { default: { story: 'x' }, first: { story: 7 } }, differentFirst: true },
      });
      const headers = TextDocumentState.section(doc, 'odf').headers!;
      expect(headers.differentFirst).toBe(true);
      expect(headers.header?.first).toBeUndefined();
      expect(
        headers.header?.default?.blocks.map((b) => b.type === 'paragraph' && Paragraph.text(b)),
      ).toEqual(['Kept']);
    });

    it('names each story a section holds once, in section order, headers before footers', () => {
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(headed())]);
      const texts = liveStoryIds(doc).map((id) =>
        TextDocumentState.storyParagraphs(doc, id)
          .map((p) => p.text)
          .join(),
      );
      expect(texts).toEqual(['Header', 'First page header', 'Even page header', 'Footer']);
    });

    it('sets the first section’s own headers by id, keeping its setup, or a new one’s', () => {
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(headed())]);
      const setup = TextDocumentState.section(doc, 'ooxml').setup;
      TextDocumentState.setFirstHeaders(doc, 'ooxml', { footer: { default: { story: 'z' } } });
      expect(doc.getMap<unknown>(DOCUMENT_MAP).get('section')).toMatchObject({
        setup,
        headers: { footer: { default: { story: 'z' } } },
      });
      TextDocumentState.setFirstHeaders(doc, 'ooxml', undefined);
      expect(doc.getMap<unknown>(DOCUMENT_MAP).get('section')).not.toHaveProperty('headers');
      const fresh = TextDocumentState.load();
      TextDocumentState.setFirstHeaders(fresh, 'odf', { header: { default: { story: 'n' } } });
      expect(TextDocumentState.section(fresh, 'odf').setup).toEqual(
        TextDocument.blank({ format: 'odf' }).section.setup,
      );
    });

    it('names none in a document without headers', () => {
      expect(liveStoryIds(TextDocumentState.load())).toEqual([]);
    });

    it('keeps the first section’s headers when its setup is set', () => {
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(headed())]);
      const section = TextDocumentState.section(doc, 'ooxml');
      TextDocumentState.setSection(doc, {
        start: section.start,
        setup: { ...section.setup, pageColor: '#ffeeee' },
      });
      const after = TextDocumentState.section(doc, 'ooxml');
      expect(after.setup.pageColor).toBe('#ffeeee');
      expect(after.headers?.header?.default?.blocks).toHaveLength(1);
    });
  });
});
