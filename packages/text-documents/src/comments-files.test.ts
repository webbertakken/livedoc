// docs/specs/034-text-documents/review.md "How a comment is kept", standard-mapping.md "Comments": a comment thread in
// either format (ODF `office:annotation` with `loext:parent-name` and `loext:resolved`; OOXML the comment ranges,
// comments.xml and commentsExtended.xml) reads as a thread marked in the writing, its replies and resolved state kept;
// a point comment, an unpaired marker and one in a story read as the spec says; written files read back the same;
// the live state carries the threads; conversion keeps them; Google's and LibreOffice's files read so.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RELATIONSHIP_TYPES, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Block, Inline, Paragraph } from './model/blocks';
import { Comments, type FileThread } from './model/comments';
import { TextDocument } from './model/text-document';
import { docx, fodt, W_P, W_R } from './testing/packages';
import { TextDocumentState } from './text-document-state';
import { LiveThreads, TEXT_DOCUMENT_REACTIONS_MAX } from './live/live-threads';
import { FILE_AUTHOR_COLOUR } from './live/live-thread-files';
import { wholeOf } from './testing/compare';
import { keptCommentIds, ooxmlCommentIds } from './ooxml/ooxml-comments';
import { odfAnnotationNames } from './odf/odf-comments';

const CORPUS = join(import.meta.dirname, '..', 'corpus');

const shape = (inlines: readonly Inline[]) =>
  inlines
    .map((i) =>
      i.type === 'run'
        ? i.text
        : i.type === 'comment'
          ? `[${i.edge === 'start' ? '' : '/'}${i.id}]`
          : `<${i.type}>`,
    )
    .join('');

async function read(bytes: Uint8Array) {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
}

function written(document: TextDocument, type: 'fodt' | 'odt' | 'docx'): Uint8Array {
  const result = writeTextDocumentFile(document, type);
  if (!result.ok) throw new Error(result.rejection);
  return result.bytes;
}

const texts = (thread: FileThread) => thread.comments.map((c) => `${c.author.name}: ${c.text}`);

const DC = 'xmlns:dc="http://purl.org/dc/elements/1.1/"';
const META = 'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"';
const LOEXT = 'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"';
const annotation = (attrs: string, creator: string, ...paragraphs: string[]) =>
  `<office:annotation ${DC} ${META} ${LOEXT} ${attrs}><dc:creator>${creator}</dc:creator><dc:date>2026-11-18T10:00:00</dc:date>${paragraphs.map((p) => `<text:p>${p}</text:p>`).join('')}</office:annotation>`;

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const comment = (id: number, author: string, paraId: string, ...lines: string[]) =>
  `<w:comment w:id="${id}" w:author="${author}" w:date="2026-11-18T10:00:00Z" w:initials="${author[0]}">${lines.map((l, i) => `<w:p${i === lines.length - 1 ? ` w14:paraId="${paraId}"` : ''}>${i === 0 ? '<w:r><w:annotationRef/></w:r>' : ''}${W_R(l)}</w:p>`).join('')}</w:comment>`;
const wordFile = (
  body: string,
  comments: string,
  extended?: string,
  more: { rels: string; entries: { name: string; data: string }[] } = { rels: '', entries: [] },
) =>
  docx(body, {
    rels:
      more.rels +
      `<Relationship Id="rId8" Type="${RELATIONSHIP_TYPES.comments}" Target="comments.xml"/>` +
      (extended === undefined
        ? ''
        : `<Relationship Id="rId9" Type="${RELATIONSHIP_TYPES.commentsExtended}" Target="commentsExtended.xml"/>`),
    entries: [
      ...more.entries,
      {
        name: 'word/comments.xml',
        data: `<?xml version="1.0"?><w:comments xmlns:w="${W}" xmlns:w14="${W14}">${comments}</w:comments>`,
      },
      ...(extended === undefined
        ? []
        : [
            {
              name: 'word/commentsExtended.xml',
              data: `<?xml version="1.0"?><w15:commentsEx xmlns:w15="${W15}">${extended}</w15:commentsEx>`,
            },
          ]),
    ],
  });

describe('a comment thread in ODF', () => {
  it('reads an annotation and its end as a thread on the stretch, a reply and resolved kept', async () => {
    const file = fodt(
      `<text:p>One ${annotation('office:name="c1" loext:resolved="true"', 'Ada', 'Looks', 'good.')}two<office:annotation-end office:name="c1"/> three${annotation('loext:parent-name="c1"', 'Bo', 'Agreed.')}</text:p>`,
    );
    const { document, report } = await read(file);
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('One [f.c1]two[/f.c1] three');
    expect(document.comments).toEqual([
      {
        id: 'f.c1',
        resolved: true,
        comments: [
          {
            id: 'f.c1',
            text: 'Looks\ngood.',
            at: Date.UTC(2026, 10, 18, 10),
            author: { name: 'Ada' },
          },
          { id: 'f.c1.1', text: 'Agreed.', at: Date.UTC(2026, 10, 18, 10), author: { name: 'Bo' } },
        ],
      },
    ]);
    expect(report.kept).toEqual([]);
  });

  it('reads an annotation with no end, or no name, as a point', async () => {
    const file = fodt(
      `<text:p>A${annotation('office:name="p"', 'Ada', 'x')}B${annotation('', 'Bo', 'y')}C</text:p>`,
    );
    const { document } = await read(file);
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('A[f.p][/f.p]B[f.a1][/f.a1]C');
    expect(document.comments?.map(texts)).toEqual([['Ada: x'], ['Bo: y']]);
  });

  it('drops an end without its annotation and an annotation in a header, each reported', async () => {
    const file = fodt(
      `<text:p>A<office:annotation-end office:name="lost"/>B</text:p><text:p><text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>N${annotation('', 'Ada', 'x')}</text:p></text:note-body></text:note></text:p>`,
    );
    const { document, report } = await read(file);
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('AB');
    expect(document.comments).toBeUndefined();
    expect(report.dropped).toContainEqual({
      reason: 'comment-unpaired',
      name: 'comment marker',
      count: 1,
    });
    expect(report.dropped).toContainEqual({
      reason: 'comment-in-story',
      name: 'comment marker',
      count: 1,
    });
  });

  it('writes threads back, replies, resolved and names kept, and reads the same', async () => {
    const file = fodt(
      `<text:p>One ${annotation('office:name="c1" loext:resolved="true"', 'Ada', 'Looks good.')}two<office:annotation-end office:name="c1"/>${annotation('loext:parent-name="c1"', 'Bo', 'Agreed.')} three</text:p>`,
    );
    const { document } = await read(file);
    for (const type of ['fodt', 'odt'] as const) {
      const again = (await read(written(document, type))).document;
      expect(shape((again.body[0] as Paragraph).inlines)).toBe('One [f.c1]two[/f.c1] three');
      expect(again.comments).toEqual(document.comments);
      expect(wholeOf((await read(written(again, type))).document)).toBe(wholeOf(again));
    }
    const xml = new TextDecoder().decode(written(document, 'fodt'));
    expect(xml).toContain('<office:annotation office:name="c1"');
    expect(xml).toContain('loext:resolved="true"');
    expect(xml).toContain('loext:parent-name="c1"');
    expect(xml).toContain('<office:annotation-end office:name="c1"/>');
  });
});

describe('a comment thread in OOXML', () => {
  const body = W_P(
    `${W_R('One ')}<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>${W_R('two')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r>${W_R(' three')}`,
  );
  const comments =
    comment(0, 'Ada', '0000000A', 'Looks', 'good.') + comment(1, 'Bo', '0000000B', 'Agreed.');
  const extended =
    '<w15:commentEx w15:paraId="0000000A" w15:done="1"/><w15:commentEx w15:paraId="0000000B" w15:paraIdParent="0000000A" w15:done="1"/>';

  it('reads ranges and comments.xml as a thread, its replies by commentsExtended', async () => {
    const { document, report } = await read(wordFile(body, comments, extended));
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('One [f.0]two[/f.0] three');
    expect(document.comments).toEqual([
      {
        id: 'f.0',
        resolved: true,
        comments: [
          {
            id: 'f.0',
            text: 'Looks\ngood.',
            at: Date.UTC(2026, 10, 18, 10),
            author: { name: 'Ada', initials: 'A' },
          },
          {
            id: 'f.1',
            text: 'Agreed.',
            at: Date.UTC(2026, 10, 18, 10),
            author: { name: 'Bo', initials: 'B' },
          },
        ],
      },
    ]);
    expect(report.kept).toEqual([]);
    expect(document.source?.format === 'ooxml' && document.source.parts.map((p) => p.name)).toEqual(
      [],
    );
  });

  it('reads every comment as its own open thread without commentsExtended', async () => {
    const { document } = await read(wordFile(body, comments));
    expect(shape((document.body[0] as Paragraph).inlines)).toBe(
      'One [f.0][f.1]two[/f.0][/f.1] three',
    );
    expect(document.comments?.map((t) => [t.id, t.resolved])).toEqual([
      ['f.0', false],
      ['f.1', false],
    ]);
  });

  it('reads a reference with no range as a point, and ranges between paragraphs', async () => {
    const file = wordFile(
      `<w:commentRangeStart w:id="1"/>${W_P(`${W_R('A')}<w:r><w:commentReference w:id="0"/></w:r>${W_R('B')}`)}<w:commentRangeEnd w:id="1"/>${W_P(W_R('C'))}`,
      comment(0, 'Ada', '0000000A', 'x') + comment(1, 'Bo', '0000000B', 'y'),
    );
    const { document } = await read(file);
    expect(document.body.map((b) => shape((b as Paragraph).inlines))).toEqual([
      '[f.1]A[f.0][/f.0]B',
      '[/f.1]C',
    ]);
  });

  it('drops a range with no comment, reported', async () => {
    const file = wordFile(
      W_P(`<w:commentRangeStart w:id="7"/>${W_R('A')}<w:commentRangeEnd w:id="7"/>`),
      '',
    );
    const { document, report } = await read(file);
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('A');
    expect(report.dropped).toContainEqual({
      reason: 'comment-unpaired',
      name: 'comment marker',
      count: 2,
    });
  });

  it('writes comments.xml and commentsExtended.xml, with a range and reference per comment, and reads the same', async () => {
    const { document } = await read(wordFile(body, comments, extended));
    const bytes = written(document, 'docx');
    const again = (await read(bytes)).document;
    expect(shape((again.body[0] as Paragraph).inlines)).toBe('One [f.0]two[/f.0] three');
    expect(again.comments).toEqual(document.comments);
    expect(wholeOf((await read(written(again, 'docx'))).document)).toBe(wholeOf(again));
    const pkg = await readOoxmlPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error('package');
    const part = (name: string) => new TextDecoder().decode(pkg.package.parts.get(name));
    expect(part('word/document.xml')).toContain(
      '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>',
    );
    expect(part('word/document.xml')).toContain(
      '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:commentRangeEnd w:id="1"/>',
    );
    expect(part('word/comments.xml')).toContain('w:author="Ada"');
    expect(part('word/comments.xml')).toContain('w:initials="A"');
    expect(part('word/commentsExtended.xml')).toMatch(/w15:paraIdParent="[0-9A-F]{8}"/);
    expect(pkg.package.relationships.get('word/document.xml')?.map((r) => r.type)).toEqual(
      expect.arrayContaining([RELATIONSHIP_TYPES.comments, RELATIONSHIP_TYPES.commentsExtended]),
    );
  });

  it('writes a LiveDoc person’s comment with initials from their name, and numbers new ids after kept ones', async () => {
    const blank = TextDocument.fromTexts(['Hi']);
    const p = blank.body[0] as Paragraph;
    const document: TextDocument = {
      ...blank,
      format: 'ooxml',
      body: [
        {
          ...p,
          inlines: [
            { type: 'comment', edge: 'start', id: 'uuid-1', props: {} },
            ...p.inlines,
            { type: 'comment', edge: 'end', id: 'uuid-1', props: {} },
          ],
        },
      ],
      comments: [
        {
          id: 'uuid-1',
          resolved: false,
          comments: [
            {
              id: 'c-1',
              text: 'Hello',
              at: 0,
              author: { name: 'Ada Lovelace', key: 'k', colour: '#123456' },
            },
          ],
        },
      ],
    };
    const bytes = written(document, 'docx');
    const pkg = await readOoxmlPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error('package');
    expect(new TextDecoder().decode(pkg.package.parts.get('word/comments.xml'))).toContain(
      'w:initials="AL"',
    );
    const again = (await read(bytes)).document;
    expect(again.comments?.[0]?.comments[0]?.author).toEqual({
      name: 'Ada Lovelace',
      initials: 'AL',
    });
  });
});

describe('comment threads across formats and the live state', () => {
  it('converts ODF ↔ OOXML keeping threads, replies and resolved', async () => {
    const odf = (
      await read(
        fodt(
          `<text:p>One ${annotation('office:name="c1" loext:resolved="true"', 'Ada', 'Looks good.')}two<office:annotation-end office:name="c1"/>${annotation('loext:parent-name="c1"', 'Bo', 'Agreed.')}</text:p>`,
        ),
      )
    ).document;
    const ooxml = (await read(written(convertTextDocument(odf, 'ooxml').document, 'docx')))
      .document;
    expect(shape((ooxml.body[0] as Paragraph).inlines)).toMatch(/^One \[f\.\d+\]two\[\/f\.\d+\]$/);
    expect(ooxml.comments?.map((t) => [t.resolved, texts(t)])).toEqual([
      [true, ['Ada: Looks good.', 'Bo: Agreed.']],
    ]);
    const back = (await read(written(convertTextDocument(ooxml, 'odf').document, 'fodt'))).document;
    expect(back.comments?.map((t) => [t.resolved, texts(t)])).toEqual([
      [true, ['Ada: Looks good.', 'Bo: Agreed.']],
    ]);
  });

  const marked = (inlines: Inline[]): Block => ({
    ...(TextDocument.blank().body[0] as Paragraph),
    inlines,
  });
  const run = (text: string): Inline => ({ type: 'run', text, props: {} });
  const mark = (edge: 'start' | 'end', id = 't'): Inline => ({
    type: 'comment',
    edge,
    id,
    props: {},
  });
  const thread: FileThread = {
    id: 't',
    resolved: true,
    comments: [
      { id: 't', text: 'x', at: 5, author: { name: 'Ada', initials: 'A' } },
      { id: 't.1', text: 'y', author: { name: 'Bo' } },
    ],
  };
  const live = (document: TextDocument) =>
    TextDocumentState.load([TextDocumentState.fromDocument(document)]);

  it('writes threads into the live state from the file, and reads them back at the same places', () => {
    const document: TextDocument = {
      ...TextDocument.blank(),
      body: [
        marked([run('ab'), mark('start'), run('cd'), mark('end'), run('e')]),
        marked([run('f')]),
      ],
      comments: [thread],
    };
    const doc = live(document);
    const [held] = LiveThreads.read(doc);
    expect(held?.quote).toBe('cd');
    expect(held?.resolved).toBe(true);
    expect(held?.comments.map((c) => c.author)).toEqual([
      { name: 'Ada', initials: 'A', colour: FILE_AUTHOR_COLOUR, fromFile: true },
      { name: 'Bo', colour: FILE_AUTHOR_COLOUR, fromFile: true },
    ]);
    const back = TextDocumentState.document(doc, 'odf');
    expect(back.body.map((b) => shape((b as Paragraph).inlines))).toEqual(['ab[t]cd[/t]e', 'f']);
    expect(wholeOf(back)).toBe(wholeOf(document));
  });

  it('moves the markers with typing before them, and reads a deleted stretch as a point with its quote', () => {
    const document: TextDocument = {
      ...TextDocument.blank(),
      body: [marked([run('ab'), mark('start'), run('cd'), mark('end'), run('e')])],
      comments: [thread],
    };
    const doc = live(document);
    const text = (TextDocumentState.body(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.insert(0, 'XY');
    expect(shape((TextDocumentState.document(doc, 'odf').body[0] as Paragraph).inlines)).toBe(
      'XYab[t]cd[/t]e',
    );
    text.delete(4, 2);
    const back = TextDocumentState.document(doc, 'odf');
    expect(shape((back.body[0] as Paragraph).inlines)).toBe('XYab[t][/t]e');
    expect(back.comments?.[0]?.quote).toBe('cd');
    expect(LiveThreads.read(live(back))[0]?.quote).toBe('cd');
  });

  it('reads a point thread as a point, a thread whose paragraph is gone at its tab’s start, in a cell too', () => {
    const point: FileThread = {
      ...thread,
      id: 'p',
      comments: [{ ...thread.comments[0]!, id: 'p' }],
    };
    const cell: Block = {
      type: 'table',
      columns: [10],
      headerRows: 0,
      rows: [
        {
          cells: [
            { props: {}, blocks: [marked([run('c'), mark('start'), run('d'), mark('end')])] },
          ],
        },
      ],
    };
    const document: TextDocument = {
      ...TextDocument.blank(),
      body: [
        marked([run('a'), mark('start', 'p'), mark('end', 'p'), run('b')]),
        cell,
        marked([run('z')]),
      ],
      comments: [point, thread],
    };
    const doc = live(document);
    const back = TextDocumentState.document(doc, 'odf');
    expect(shape((back.body[0] as Paragraph).inlines)).toBe('a[p][/p]b');
    expect(back.comments?.find((t) => t.id === 'p')?.quote).toBeUndefined();
    const table = back.body[1] as Extract<Block, { type: 'table' }>;
    expect(shape((table.rows[0]!.cells[0]!.blocks[0] as Paragraph).inlines)).toBe('c[t]d[/t]');
    // The table goes: its thread is written as a point at the start of its tab.
    TextDocumentState.body(doc).delete(1, 1);
    const gone = TextDocumentState.document(doc, 'odf');
    expect(shape((gone.body[0] as Paragraph).inlines)).toBe('[t][/t]a[p][/p]b');
    expect(gone.comments?.find((t) => t.id === 't')?.quote).toBe('d');
  });

  it('leaves a document with no comments without them, and empties the threads when one is written whole', () => {
    const doc = live({
      ...TextDocument.blank(),
      body: [marked([run('a'), mark('start'), mark('end')])],
      comments: [thread],
    });
    expect(LiveThreads.read(doc)).toHaveLength(1);
    const blank = TextDocument.blank();
    const plain = TextDocumentState.load([TextDocumentState.fromDocument(blank)]);
    expect(TextDocumentState.document(plain, 'odf').comments).toBeUndefined();
  });
});

describe('the corpus’s comments', () => {
  it.each<[string]>([['google/features-gdocs.docx'], ['libreoffice/features.fodt']])(
    'reads %s’s comment by Ada on “ here”, open',
    async (file) => {
      const { document } = await read(readFileSync(join(CORPUS, file)));
      expect(document.comments?.map((t) => [t.resolved, texts(t)])).toEqual([
        [false, ['Ada: Looks good.']],
      ]);
      const paragraph = TextDocument.paragraphs(document).find((p) =>
        p.inlines.some((i) => i.type === 'comment'),
      )!;
      expect(shape(paragraph.inlines)).toMatch(/and a comment\[f\.\w+\] here\[\/f\.\w+\]\.$/);
    },
  );
});

describe('a comment’s text, authors and names in the files', () => {
  it('reads an annotation’s spaces, tabs, breaks and lists as plain text, its initials kept, a missing date none', async () => {
    const rich = `<office:annotation ${DC} ${META} office:name="r"><dc:creator> Ada </dc:creator><meta:creator-initials>AL</meta:creator-initials><text:p>a<text:s text:c="2"/>b<text:tab/>c<text:line-break/>d <text:span>e</text:span></text:p><text:list><text:list-item><text:p>item</text:p></text:list-item></text:list></office:annotation>`;
    const { document } = await read(
      fodt(`<text:p>x${rich}y<office:annotation-end office:name="r"/></text:p>`),
    );
    expect(document.comments?.[0]?.comments[0]).toEqual({
      id: 'f.r',
      text: 'a  b\tc\nd e\nitem',
      author: { name: 'Ada', initials: 'AL' },
    });
  });

  it('reads a reply’s own end as nothing, a reply to a reply into the thread, and a repeated name as a thread of its own', async () => {
    const { document } = await read(
      fodt(
        `<text:p>${annotation('office:name="c"', 'Ada', 'a')}x${annotation('office:name="r1" loext:parent-name="c"', 'Bo', 'b')}<office:annotation-end office:name="r1"/>${annotation('loext:parent-name="r1"', 'Cy', 'c')}<office:annotation-end office:name="c"/>${annotation('office:name="c"', 'Di', 'd')}y</text:p>`,
      ),
    );
    expect(shape((document.body[0] as Paragraph).inlines)).toBe('[f.c]x[/f.c][f.a3][/f.a3]y');
    expect(document.comments?.map(texts)).toEqual([['Ada: a', 'Bo: b', 'Cy: c'], ['Di: d']]);
  });

  it('drops an annotation’s end in a note, reported', async () => {
    const { report } = await read(
      fodt(
        `<text:p>${annotation('office:name="c"', 'Ada', 'a')}x<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>N<office:annotation-end office:name="c"/></text:p></text:note-body></text:note></text:p>`,
      ),
    );
    expect(report.dropped).toContainEqual({
      reason: 'comment-in-story',
      name: 'comment marker',
      count: 1,
    });
  });

  it('names threads by their file’s names where free, the rest __Annotation__<n>', () => {
    const t = (id: string): FileThread => ({ id, resolved: false, comments: [] });
    expect([
      ...odfAnnotationNames([t('f.c1'), t('uuid'), t('f.__Annotation__0'), t('f.a b')]),
    ]).toEqual([
      ['f.c1', 'c1'],
      ['f.__Annotation__0', '__Annotation__0'],
      ['uuid', '__Annotation__1'],
      ['f.a b', '__Annotation__2'],
    ]);
  });

  it('writes a comment with no time without a date, and an empty thread not at all', () => {
    const blank = TextDocument.fromTexts(['Hi']);
    const p = blank.body[0] as Paragraph;
    const marked = (id: string): Inline[] => [
      { type: 'comment', edge: 'start', id, props: {} },
      { type: 'comment', edge: 'end', id, props: {} },
    ];
    const document: TextDocument = {
      ...blank,
      body: [{ ...p, inlines: [...marked('a'), ...p.inlines, ...marked('empty')] }],
      comments: [
        { id: 'a', resolved: false, comments: [{ id: 'a', text: '', author: { name: 'Ada' } }] },
        { id: 'empty', resolved: false, comments: [] },
      ],
    };
    const odf = new TextDecoder().decode(written(document, 'fodt'));
    expect(odf).toContain('<dc:creator>Ada</dc:creator><text:p></text:p></office:annotation>');
    const docx = written({ ...document, format: 'ooxml' }, 'docx');
    expect(docx.byteLength).toBeGreaterThan(0);
  });

  it('numbers Word comments by their file’s ids where free and past kept ones, the rest after the highest', () => {
    const t = (...ids: string[]): FileThread => ({
      id: ids[0]!,
      resolved: false,
      comments: ids.map((id) => ({ id, text: '', author: { name: '' } })),
    });
    expect([...ooxmlCommentIds([t('f.3', 'f.9'), t('uuid', 'f.3'), t('f.1')], 1)]).toEqual([
      ['f.3', [3, 9]],
      ['uuid', [10, 11]],
      ['f.1', [12]],
    ]);
    expect(
      keptCommentIds([
        '<w:commentRangeStart w:id="4"/>',
        '<w:commentReference w:id="7"/>',
        '<w:p/>',
      ]),
    ).toBe(7);
  });

  it('drops a range and a reference in a footnote, reported as in a story', async () => {
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const file = wordFile(
      W_P(`${W_R('A')}<w:r><w:footnoteReference w:id="1"/></w:r>`),
      comment(0, 'Ada', '0000000A', 'x'),
      undefined,
      {
        rels: `<Relationship Id="rId7" Type="${RELATIONSHIP_TYPES.footnotes}" Target="footnotes.xml"/>`,
        entries: [
          {
            name: 'word/footnotes.xml',
            data: `<?xml version="1.0"?><w:footnotes xmlns:w="${W_NS}"><w:footnote w:id="1"><w:p><w:commentRangeStart w:id="0"/>${W_R('N')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p></w:footnote></w:footnotes>`,
          },
        ],
      },
    );
    const { document, report } = await read(file);
    expect(document.comments).toBeUndefined();
    expect(report.dropped).toContainEqual({
      reason: 'comment-in-story',
      name: 'comment marker',
      count: 3,
    });
  });
});

// review.md "Reactions": `livedoc:reactions` on the comment in both formats; a malformed one dropped.
describe('a comment’s reactions in the files', () => {
  const run = (text: string): Inline => ({ type: 'run', text, props: {} });
  const mark = (edge: 'start' | 'end'): Inline => ({ type: 'comment', edge, id: 't', props: {} });
  const reacted: TextDocument = {
    ...TextDocument.blank(),
    body: [
      {
        ...(TextDocument.blank().body[0] as Paragraph),
        inlines: [run('ab'), mark('start'), run('cd'), mark('end')],
      },
    ],
    comments: [
      {
        id: 't',
        resolved: false,
        comments: [
          {
            id: 't',
            text: 'x',
            at: 5,
            author: { name: 'Ada', key: 'a1' },
            reactions: { '👍': ['a1', 'b2'], '🎉': ['c3'] },
          },
          { id: 't.1', text: 'y', author: { name: 'Bo' }, reactions: { '❤️': ['b2'] } },
        ],
      },
    ],
  };
  const reactionsOf = (document: TextDocument) =>
    document.comments?.[0]?.comments.map((c) => c.reactions);

  it('writes them on each comment in ODF and OOXML, and reads them back', async () => {
    for (const type of ['fodt', 'odt', 'docx'] as const) {
      const source = type === 'docx' ? convertTextDocument(reacted, 'ooxml').document : reacted;
      const again = (await read(written(source, type))).document;
      expect(reactionsOf(again)).toEqual([{ '👍': ['a1', 'b2'], '🎉': ['c3'] }, { '❤️': ['b2'] }]);
    }
    expect(new TextDecoder().decode(written(reacted, 'fodt'))).toContain('livedoc:reactions=');
  });

  it('carries them into the live state and back', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(reacted)]);
    expect(LiveThreads.read(doc)[0]!.comments.map((c) => c.reactions)).toEqual([
      { '👍': ['a1', 'b2'], '🎉': ['c3'] },
      { '❤️': ['b2'] },
    ]);
    expect(reactionsOf(TextDocumentState.document(doc, 'odf'))).toEqual(reactionsOf(reacted));
  });

  it('reads malformed reactions as none', () => {
    for (const bad of [
      'not json',
      '[1]',
      '{"👍":"a1"}',
      '{"👍":["NOT HEX"]}',
      `{"${'x'.repeat(17)}":["a1"]}`,
    ])
      expect(Comments.readReactions(bad)).toBeUndefined();
    const many = Object.fromEntries(
      Array.from({ length: TEXT_DOCUMENT_REACTIONS_MAX + 1 }, (_, i) => [`e${i}`, ['a1']]),
    );
    expect(Comments.readReactions(JSON.stringify(many))).toBeUndefined();
    expect(Comments.readReactions('{"👍":["a1"],"🎉":[]}')).toEqual({ '👍': ['a1'] });
  });
});
