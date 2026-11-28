// docs/specs/034-text-documents/files-and-print.md "Downloading": the EPUB, an EPUB 3 book of the writing, one chapter a
// Heading 1, its contents, stylesheet, pictures and footnotes; every XML entry well-formed.
import { listZip, parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { GREEN_PNG, GREEN_PNG_SHA } from '../testing/pictures';
import { unzipped } from '../testing/unzipped';
import { writeEpub } from './epub';
import { writeTextDocumentExport } from './text-document-exports';

const styles = Styles.builtIn('odf');
const id = (role: Parameters<typeof Styles.idOfRole>[1]) => Styles.idOfRole(styles, role)!;
const run = (text: string, extra = {}): Inline => ({ type: 'run', text, props: {}, ...extra });
const p = (inlines: Inline[], role: Parameters<typeof id>[0] = 'normal'): Paragraph => ({
  type: 'paragraph',
  style: id(role),
  props: {},
  inlines,
});
const doc = (body: Block[], extra: Partial<TextDocument> = {}): TextDocument => ({
  ...TextDocument.blank({ format: 'odf' }),
  body,
  ...extra,
});
const WHEN = new Date('2026-11-28T10:20:30.456Z');
const book = async (document: TextDocument) => {
  const files = await unzipped(writeEpub(document, { when: WHEN, identifier: 'urn:uuid:1234' }));
  const decoder = new TextDecoder();
  return {
    names: [...files.keys()],
    text: (name: string) => decoder.decode(files.get(name)),
    bytes: (name: string) => files.get(name),
  };
};

describe('the EPUB of every construct', () => {
  it.each(Object.keys(CONSTRUCTS))('writes %s with every XML entry well-formed', async (name) => {
    const read = await book(CONSTRUCTS[name]!('odf'));
    for (const entry of read.names.filter((n) => /\.(xhtml|opf|xml)$/.test(n)))
      expect(parseXml(read.text(entry), entry).ok, entry).toBe(true);
  });
});

describe('writeEpub', () => {
  it('stores its media type first, uncompressed, as EPUB asks', () => {
    const bytes = writeEpub(doc([p([run('Hi')])]), { when: WHEN, identifier: 'urn:uuid:1234' });
    const listed = listZip(bytes);
    expect(listed.ok && listed.entries[0]).toMatchObject({ name: 'mimetype', method: 0 });
    expect(new TextDecoder().decode(bytes.slice(30, 38 + 20))).toBe('mimetypeapplication/epub+zip');
  });

  it('splits chapters at each Heading 1, the writing before the first a chapter of its own', async () => {
    const read = await book(
      doc(
        [
          p([run('Preface')]),
          p([run('One')], 'heading1'),
          p([run('a')]),
          p([run('Sub')], 'heading2'),
          p([run('Two & more')], 'heading1'),
          p([run('b'), { type: 'note', blocks: [p([run('Note.')])], props: {} }]),
        ],
        { metadata: { title: 'Book', language: 'nl' } },
      ),
    );
    expect(read.names).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/style.css',
      'OEBPS/chapter-1.xhtml',
      'OEBPS/chapter-2.xhtml',
      'OEBPS/chapter-3.xhtml',
      'OEBPS/notes.xhtml',
    ]);
    expect(read.text('OEBPS/chapter-2.xhtml')).toContain('<title>One</title>');
    expect(read.text('OEBPS/chapter-2.xhtml')).toContain(
      '<body>\n<h1>One</h1>\n<p>a</p>\n<h2>Sub</h2>\n</body>',
    );
    expect(read.text('OEBPS/chapter-3.xhtml')).toContain(
      '<sup><a href="notes.xhtml#fn1" id="fnref1">1</a></sup>',
    );
    expect(read.text('OEBPS/notes.xhtml')).toContain(
      '<li id="fn1"><p>Note.</p> <a href="chapter-3.xhtml#fnref1">↩</a></li>',
    );
    expect(read.text('OEBPS/nav.xhtml')).toContain(
      '<ol><li><a href="chapter-1.xhtml">Start</a></li><li><a href="chapter-2.xhtml">One</a></li>' +
        '<li><a href="chapter-3.xhtml">Two &amp; more</a></li><li><a href="notes.xhtml">Notes</a></li></ol>',
    );
    const opf = read.text('OEBPS/content.opf');
    expect(opf).toContain('<dc:identifier id="id">urn:uuid:1234</dc:identifier>');
    expect(opf).toContain('<dc:title>Book</dc:title>');
    expect(opf).toContain('<dc:language>nl</dc:language>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-28T10:20:30Z</meta>');
    expect(opf).toContain(
      '<spine><itemref idref="chapter-1" /><itemref idref="chapter-2" /><itemref idref="chapter-3" /><itemref idref="notes" /></spine>',
    );
  });

  it('links to a bookmark in another chapter by its file', async () => {
    const read = await book(
      doc([
        p([run('to there', { link: '#there' })]),
        p([{ type: 'bookmark', name: 'there', props: {} }, run('There')], 'heading1'),
      ]),
    );
    expect(read.text('OEBPS/chapter-1.xhtml')).toContain(
      '<a href="chapter-2.xhtml#there">to there</a>',
    );
  });

  it('opens a chapter a document tab when there are several, its first Heading 1 within it', async () => {
    const read = await book(CONSTRUCTS.tabs!('odf'));
    expect(read.text('OEBPS/nav.xhtml')).toContain(
      '<li><a href="chapter-1.xhtml">Overview</a></li><li><a href="chapter-2.xhtml">Details</a></li>',
    );
    expect(read.text('OEBPS/chapter-1.xhtml')).toContain('<h1>Overview</h1>\n<h1>Overview</h1>');
  });

  it('lists pictures, MathML and SVG in the manifest', async () => {
    const read = await book({
      ...CONSTRUCTS.equations!('odf'),
      media: { [GREEN_PNG_SHA]: { mediaType: 'image/png', bytes: GREEN_PNG } },
      body: [
        ...CONSTRUCTS.equations!('odf').body,
        p([
          {
            type: 'picture',
            media: GREEN_PNG_SHA,
            width: 10,
            height: 10,
            props: {},
            recolour: { kind: 'greyscale' },
          },
        ]),
      ],
    });
    const opf = read.text('OEBPS/content.opf');
    expect(opf).toContain(
      '<item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml" properties="mathml svg" />',
    );
    expect(opf).toContain('<item id="image-1" href="images/1.png" media-type="image/png" />');
    expect(read.bytes('OEBPS/images/1.png')).toEqual(GREEN_PNG);
  });

  it('writes an empty document as one empty chapter', async () => {
    const read = await book(doc([]));
    expect(read.names.filter((n) => n.includes('chapter'))).toEqual(['OEBPS/chapter-1.xhtml']);
    expect(read.text('OEBPS/chapter-1.xhtml')).toContain('<body></body>');
  });

  it('names itself by a fresh identifier when given none', async () => {
    const files = await unzipped(writeTextDocumentExport(doc([]), 'epub'));
    expect(new TextDecoder().decode(files.get('OEBPS/content.opf'))).toMatch(
      /<dc:identifier id="id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/,
    );
  });
});
