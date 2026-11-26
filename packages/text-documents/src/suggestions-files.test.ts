// docs/specs/034-text-documents/review.md "How a suggestion is kept" ("In the files"), standard-mapping.md
// "Suggestions": Word's tracked changes read as suggestions from the file (runs inside `w:ins` / `w:del` and moves,
// a run's `w:rPrChange`, a paragraph's `w:pPrChange`, a paragraph mark's change as the next paragraph's break or join),
// never kept twice, written back as Word writes them, one LiveDoc suggestion reading back as one; a change in a story
// (a header, footer or note) read and written as the body's.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Inline, Paragraph, Run } from './model/blocks';
import { UNKNOWN_SUGGESTION_AUTHOR } from './model/suggestions';
import type { TextDocument } from './model/text-document';
import { docx, fodt, W_P, W_R } from './testing/packages';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSTRUCTS } from './testing/constructs';
import { convertTextDocument } from './convert';
import { TextDocumentState } from './text-document-state';
import { LiveSuggestions } from './live/live-suggestions';
import { FILE_AUTHOR_COLOUR } from './live/live-thread-files';

async function read(bytes: Uint8Array) {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
}

function written(document: TextDocument): Uint8Array {
  const result = writeTextDocumentFile(document, 'docx');
  if (!result.ok) throw new Error(result.rejection);
  return result.bytes;
}

const paragraphs = (document: TextDocument) =>
  document.body.filter((b): b is Paragraph => b.type === 'paragraph');

/** The paragraph's runs as text, each suggested stretch marked `+…+`, `-…-` or `*…*`. */
const shape = (inlines: readonly Inline[]) =>
  inlines
    .map((i) => {
      if (i.type !== 'run') return `<${i.type}>`;
      const { insertion, deletion, format } = i.suggested ?? {};
      return insertion ? `+${i.text}+` : deletion ? `-${i.text}-` : format ? `*${i.text}*` : i.text;
    })
    .join('');

const DATE = '2026-11-20T09:30:00Z';
const AT = Date.UTC(2026, 10, 20, 9, 30);
const ins = (id: number, inner: string, author = 'Ada') =>
  `<w:ins w:id="${id}" w:author="${author}" w:date="${DATE}">${inner}</w:ins>`;
const del = (id: number, text: string, author = 'Ada') =>
  `<w:del w:id="${id}" w:author="${author}" w:date="${DATE}"><w:r><w:delText xml:space="preserve">${text}</w:delText></w:r></w:del>`;

describe('Word’s tracked changes, read', () => {
  it('reads inserted and deleted runs as suggestions from the file, with their author and time', async () => {
    const { document, report } = await read(
      docx(W_P(`${W_R('The ')}${ins(1, W_R('quick '))}${del(2, 'slow ', 'Bo')}${W_R('fox')}`)),
    );
    const [p] = paragraphs(document);
    expect(shape(p!.inlines)).toBe('The +quick +-slow -fox');
    expect((p!.inlines[1] as Run).suggested).toEqual({
      insertion: { id: 'f.1', at: AT, author: { name: 'Ada' } },
    });
    expect((p!.inlines[2] as Run).suggested).toEqual({
      deletion: { id: 'f.2', at: AT, author: { name: 'Bo' } },
    });
    expect(report.kept).toEqual([]);
  });

  it('reads a move as a deletion and an insertion, and a change with no author as the unknown author', async () => {
    const { document } = await read(
      docx(
        W_P(
          `<w:moveFrom w:id="3"><w:r><w:delText>away</w:delText></w:r></w:moveFrom><w:moveTo w:id="4">${W_R('here')}</w:moveTo>`,
        ),
      ),
    );
    const [p] = paragraphs(document);
    expect(shape(p!.inlines)).toBe('-away-+here+');
    expect((p!.inlines[1] as Run).suggested?.insertion?.author.name).toBe(
      UNKNOWN_SUGGESTION_AUTHOR,
    );
  });

  it('reads a run’s format change with its formatting before', async () => {
    const { document } = await read(
      docx(
        W_P(
          `<w:r><w:rPr><w:b/><w:rPrChange w:id="5" w:author="Ada" w:date="${DATE}"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr><w:t>bold</w:t></w:r>`,
        ),
      ),
    );
    const run = paragraphs(document)[0]!.inlines[0] as Run;
    expect(run.props).toEqual({ bold: true });
    expect(run.suggested?.format).toEqual({
      id: 'f.5',
      at: AT,
      author: { name: 'Ada' },
      before: { props: { italic: true } },
    });
  });

  it('reads a paragraph mark’s change as the next paragraph’s break or join', async () => {
    const mark = (change: string) => `<w:pPr><w:rPr>${change}</w:rPr></w:pPr>`;
    const { document } = await read(
      docx(
        `<w:p>${mark(`<w:ins w:id="6" w:author="Ada" w:date="${DATE}"/>`)}${W_R('one')}</w:p>` +
          `<w:p>${mark(`<w:del w:id="7" w:author="Bo" w:date="${DATE}"/>`)}${W_R('two')}</w:p>` +
          W_P(W_R('three')),
      ),
    );
    const [one, two, three] = paragraphs(document);
    expect(one!.suggested).toBeUndefined();
    expect(two!.suggested).toEqual({ break: { id: 'f.6', at: AT, author: { name: 'Ada' } } });
    expect(three!.suggested).toEqual({ join: { id: 'f.7', at: AT, author: { name: 'Bo' } } });
  });

  it('reads a paragraph’s format change with its style before', async () => {
    const { document } = await read(
      docx(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pPrChange w:id="8" w:author="Ada" w:date="${DATE}"><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange></w:pPr>${W_R('title')}</w:p>`,
      ),
    );
    const [p] = paragraphs(document);
    expect(p!.style).toBe('Heading1');
    expect(p!.suggested?.format).toMatchObject({
      id: 'f.8',
      before: { style: 'Normal', props: { align: 'center' } },
    });
  });

  it('drops a change on the last paragraph’s mark and settles changes in a footnote, each reported', async () => {
    const { report } = await read(
      docx(
        `<w:p><w:pPr><w:rPr><w:ins w:id="9" w:author="Ada"/></w:rPr></w:pPr>${W_R('end')}</w:p>`,
      ),
    );
    expect(report.dropped).toContainEqual({
      reason: 'suggestion-last-mark',
      name: 'paragraph mark',
      count: 1,
    });
  });
});

describe('Word’s tracked changes, written', () => {
  it('writes each kind back and reads it back the same', async () => {
    const file = docx(
      `<w:p><w:pPr><w:rPr><w:lang w:val="de-DE"/><w:ins w:id="6" w:author="Ada" w:date="${DATE}"/></w:rPr></w:pPr>${W_R('The ')}${ins(1, W_R('quick '))}${del(2, 'slow ')}` +
        `<w:r><w:rPr><w:b/><w:rPrChange w:id="5" w:author="Ada" w:date="${DATE}"><w:rPr/></w:rPrChange></w:rPr><w:t>fox</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pPrChange w:id="8" w:author="Ada" w:date="${DATE}"><w:pPr/></w:pPrChange></w:pPr>${W_R('jumps')}</w:p>`,
    );
    const { document } = await read(file);
    const bytes = written(document);
    const again = (await read(bytes)).document;
    expect(paragraphs(again).map((p) => p.suggested)).toEqual(
      paragraphs(document).map((p) => p.suggested),
    );
    expect(
      paragraphs(again).map((p) =>
        p.inlines.map((i) => (i.type === 'comment' ? undefined : i.suggested)),
      ),
    ).toEqual(
      paragraphs(document).map((p) =>
        p.inlines.map((i) => (i.type === 'comment' ? undefined : i.suggested)),
      ),
    );
  });

  it('writes a paragraph mark’s change once, beside what its mark kept', async () => {
    const file = docx(
      `<w:p><w:pPr><w:rPr><w:lang w:val="de-DE"/><w:ins w:id="6" w:author="Ada" w:date="${DATE}"/></w:rPr></w:pPr>${W_R('one')}</w:p>${W_P(W_R('two'))}`,
    );
    const main = await mainPart(written((await read(file)).document));
    expect(main.match(/<w:ins /g)).toHaveLength(1);
    expect(main).toMatch(
      /<w:rPr><w:ins w:id="6" w:author="Ada" w:date="2026-11-20T09:30:00Z"\/><w:lang w:val="de-DE"\/><\/w:rPr>/,
    );
  });

  it('writes deleted text as w:delText, and one suggestion of LiveDoc’s as one on reading back', async () => {
    const mark = { id: 'sugg-1', at: AT, author: { name: 'Ada', key: 'k-ada', colour: '#0284c7' } };
    const { document } = await read(docx(W_P(W_R('abc'))));
    const [p] = paragraphs(document);
    const changed: TextDocument = {
      ...document,
      body: [
        {
          ...p!,
          inlines: [
            { type: 'run', text: 'gone', props: {}, suggested: { deletion: mark } },
            { type: 'run', text: 'abc', props: {} },
            { type: 'run', text: 'new', props: { bold: true }, suggested: { insertion: mark } },
          ],
        },
      ],
    };
    const bytes = written(changed);
    const main = await mainPart(bytes);
    expect(main).toContain('<w:delText>gone</w:delText>');
    expect(main).toContain('livedoc:id="sugg-1"');
    const back = paragraphs((await read(bytes)).document)[0]!.inlines as Run[];
    expect(back.map((r) => r.suggested?.insertion?.id ?? r.suggested?.deletion?.id)).toEqual([
      'sugg-1',
      undefined,
      'sugg-1',
    ]);
  });
});

/** The written main part's XML. */
async function mainPart(bytes: Uint8Array): Promise<string> {
  const pkg = await readOoxmlPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error('package');
  return new TextDecoder().decode(pkg.package.parts.get('word/document.xml'));
}

describe('Word’s tracked changes in the live state', () => {
  const file = docx(
    `<w:p><w:pPr><w:rPr><w:ins w:id="6" w:author="Ada" w:date="${DATE}"/></w:rPr></w:pPr>${W_R('The ')}${ins(1, W_R('quick '))}${del(2, 'slow ')}` +
      `<w:r><w:rPr><w:b/><w:rPrChange w:id="5" w:author="Ada" w:date="${DATE}"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr><w:t>fox</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pPrChange w:id="8" w:author="Ada" w:date="${DATE}"><w:pPr/></w:pPrChange></w:pPr>${W_R('jumps')}</w:p>`,
  );

  it('carries every suggestion into the live state and back to the model unchanged', async () => {
    const { document } = await read(file);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const back = TextDocumentState.document(doc, 'ooxml');
    const suggestedOf = (d: TextDocument) =>
      paragraphs(d).map((p) => [
        p.suggested,
        p.inlines.map((i) => (i.type === 'comment' ? undefined : i.suggested)),
      ]);
    expect(suggestedOf(back)).toEqual(suggestedOf(document));
  });

  it('reads as suggestions from the file, in the neutral colour, with no key', async () => {
    const { document } = await read(file);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const suggestions = LiveSuggestions.read(doc);
    expect(suggestions.map((s) => [s.id, s.parts.map((p) => p.kind)])).toEqual([
      ['f.1', ['insertion']],
      ['f.2', ['deletion']],
      ['f.5', ['format']],
      ['f.6', ['break']],
      ['f.8', ['paragraph-format']],
    ]);
    expect(suggestions[0]!.author).toEqual({
      name: 'Ada',
      colour: FILE_AUTHOR_COLOUR,
      fromFile: true,
    });
  });

  it('rejects a file’s format change back to its formatting before', async () => {
    const { document } = await read(file);
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    LiveSuggestions.reject(doc, 'f.5', 'test');
    const fox = (paragraphs(TextDocumentState.document(doc, 'ooxml'))[0]!.inlines as Run[]).find(
      (r) => r.text === 'fox',
    );
    expect(fox?.props).toEqual({ italic: true });
    expect(fox?.suggested).toBeUndefined();
  });
});

const TC = (regions: string, body: string) =>
  fodt(`<text:tracked-changes text:track-changes="false">${regions}</text:tracked-changes>${body}`);
const region = (id: string, kind: string, author = 'Ada', inner = '', extra = '') =>
  `<text:changed-region xmlns:dc="http://purl.org/dc/elements/1.1/" xml:id="${id}" text:id="${id}"${extra}><text:${kind}><office:change-info><dc:creator>${author}</dc:creator><dc:date>2026-11-20T09:30:00</dc:date></office:change-info>${inner}</text:${kind}></text:changed-region>`;
const start = (id: string) => `<text:change-start text:change-id="${id}"/>`;
const end = (id: string) => `<text:change-end text:change-id="${id}"/>`;

describe('ODF’s tracked changes, read', () => {
  it('reads LibreOffice’s ranges: insertions, deletions in place, a format change and a paragraph break', async () => {
    const bytes = readFileSync(
      join(import.meta.dirname, '..', 'corpus', 'libreoffice', 'suggestions.fodt'),
    );
    const { document, report } = await read(bytes);
    const [one, two, three, four] = paragraphs(document);
    expect(shape(one!.inlines)).toBe('The +quick +-slow -*fox*');
    expect(two!.suggested?.break?.author.name).toBe('Ada Lovelace');
    expect(shape(three!.inlines)).toBe('Over');
    expect(four!.suggested?.join?.author.name).toBe('Bo');
    // LibreOffice writes a paragraph's attributes as its own unknown change: reported, read as nothing.
    expect(report.dropped).toContainEqual({
      reason: 'suggestion-unknown',
      name: 'UnknownChange',
      count: 1,
    });
    expect(report.kept.map((k) => k.name)).toEqual(['sequence-decls']);
  });

  it('reads the point form’s deletion at its place, a second paragraph as a line break, reported', async () => {
    const { document, report } = await read(
      TC(
        region('c1', 'deletion', 'Bo', '<text:p>gone</text:p><text:p>too</text:p>'),
        `<text:p>A<text:change text:change-id="c1"/>B</text:p>`,
      ),
    );
    const [p] = paragraphs(document);
    expect(shape(p!.inlines)).toBe('A-gone\ntoo-B');
    expect((p!.inlines[1] as Run).suggested?.deletion).toEqual({
      id: 'f.c1',
      at: AT,
      author: { name: 'Bo' },
    });
    expect(report.dropped).toContainEqual({
      reason: 'suggestion-paragraphs',
      name: 'deletion',
      count: 1,
    });
  });

  it('reads a change in a footnote as the note’s own suggestions', async () => {
    const { document, report } = await read(
      TC(
        region('c1', 'insertion') + region('c2', 'deletion'),
        `<text:p>A<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>${start('c1')}in${end('c1')}${start('c2')}out${end('c2')}</text:p></text:note-body></text:note></text:p>`,
      ),
    );
    const note = paragraphs(document)[0]!.inlines.find((i) => i.type === 'note');
    const text = note?.type === 'note' ? (note.blocks[0] as Paragraph).inlines : [];
    expect(shape(text)).toBe('+in+-out-');
    expect(report.dropped).toEqual([]);
  });
});

describe('ODF’s tracked changes, written', () => {
  it('writes each suggestion as a range with its region first in the text, and reads it back the same', async () => {
    for (const type of ['fodt', 'odt'] as const) {
      const document = CONSTRUCTS.suggestions!('odf');
      const result = writeTextDocumentFile(document, type);
      if (!result.ok) throw new Error(result.rejection);
      const back = (await read(result.bytes)).document;
      expect(paragraphs(back).map((p) => p.suggested)).toEqual(
        paragraphs(document).map((p) => p.suggested),
      );
      expect(
        paragraphs(back).map((p) =>
          p.inlines.map((i) => (i.type === 'comment' ? undefined : i.suggested)),
        ),
      ).toEqual(
        paragraphs(document).map((p) =>
          p.inlines.map((i) => (i.type === 'comment' ? undefined : i.suggested)),
        ),
      );
    }
    const result = writeTextDocumentFile(CONSTRUCTS.suggestions!('odf'), 'fodt');
    const xml = new TextDecoder().decode((result as { bytes: Uint8Array }).bytes);
    expect(xml).toMatch(
      /<office:text>\s*<text:tracked-changes text:track-changes="false"><text:changed-region xml:id="ct1"/,
    );
    expect(xml).toContain(
      '<text:change-start text:change-id="ct1"/>quick <text:change-end text:change-id="ct1"/>',
    );
    expect(xml).toContain('livedoc:paragraph="true"');
  });

  it('puts its regions into a tracked-changes list a document read before kept', async () => {
    const document = CONSTRUCTS.suggestions!('odf');
    const kept: TextDocument = {
      ...document,
      body: [
        {
          type: 'kept',
          name: 'tracked-changes',
          xml: {
            xml: '<text:tracked-changes><text:changed-region text:id="old"/></text:tracked-changes>',
            ns: {},
          },
        },
        ...document.body,
      ],
    };
    const result = writeTextDocumentFile(kept, 'fodt');
    const xml = new TextDecoder().decode((result as { bytes: Uint8Array }).bytes);
    expect(xml.match(/<text:tracked-changes/g)).toHaveLength(1);
    expect(xml).toMatch(/text:id="old"\/><text:changed-region xml:id="ct1"/);
  });
});

describe('suggestions converted', () => {
  it('keeps every suggestion from Word to ODF and back', async () => {
    const document = CONSTRUCTS.suggestions!('ooxml');
    const odf = convertTextDocument(document, 'odf').document;
    const back = convertTextDocument(odf, 'ooxml').document;
    const kinds = (d: TextDocument) =>
      paragraphs(d).map((p) => [
        Object.keys(p.suggested ?? {}),
        p.inlines.map((i) => (i.type === 'comment' ? [] : Object.keys(i.suggested ?? {}))),
      ]);
    expect(kinds(odf)).toEqual(kinds(document));
    expect(kinds(back)).toEqual(kinds(document));
    const written = writeTextDocumentFile(odf, 'fodt');
    if (!written.ok) throw new Error(written.rejection);
    expect(kinds((await read(written.bytes)).document)).toEqual(kinds(document));
  });
});

// review.md "In the files": a header's, footer's or note's tracked change arrives as a suggestion there and leaves as
// the same format's tracked change in that story, in both formats, and holds in the live state.
describe('suggestions in stories, in both formats', () => {
  const MARK = { id: 's1', at: AT, author: { key: 'k', name: 'Ada', colour: '#0284c7' } };

  function withFirstRunInserted<T extends { blocks: readonly unknown[] }>(story: T): T {
    const [first, ...rest] = story.blocks as Paragraph[];
    const i = first!.inlines.findIndex((x) => x.type === 'run');
    const inlines = first!.inlines.map((x, n) =>
      n === i ? { ...x, suggested: { insertion: MARK } } : x,
    );
    return { ...story, blocks: [{ ...first!, inlines }, ...rest] };
  }

  /** The headers construct, its default header's first run a suggested insertion. */
  function headed(format: 'odf' | 'ooxml'): TextDocument {
    const document = CONSTRUCTS.headers!(format);
    const headers = document.section.headers!;
    const header = { ...headers.header!, default: withFirstRunInserted(headers.header!.default!) };
    return { ...document, section: { ...document.section, headers: { ...headers, header } } };
  }

  /** The footnotes construct, its first note's first run a suggested insertion. */
  function noted(format: 'odf' | 'ooxml'): TextDocument {
    const document = CONSTRUCTS.footnotes!(format);
    let done = false;
    const body = document.body.map((b) => {
      if (done || b.type !== 'paragraph') return b;
      const inlines = b.inlines.map((x) => {
        if (done || x.type !== 'note') return x;
        done = true;
        return withFirstRunInserted(x);
      });
      return { ...b, inlines };
    });
    return { ...document, body };
  }

  const headerRun = (document: TextDocument) =>
    (document.section.headers!.header!.default!.blocks[0] as Paragraph).inlines.find(
      (x): x is Run => x.type === 'run',
    );
  const noteRun = (document: TextDocument) => {
    for (const b of document.body)
      if (b.type === 'paragraph')
        for (const x of b.inlines)
          if (x.type === 'note')
            return (x.blocks[0] as Paragraph).inlines.find((r): r is Run => r.type === 'run');
    return undefined;
  };

  it.each([
    ['docx', 'ooxml'],
    ['odt', 'odf'],
  ] as const)(
    'writes and reads back a header’s and a note’s suggestion (%s)',
    async (type, format) => {
      for (const [document, run] of [
        [headed(format), headerRun],
        [noted(format), noteRun],
      ] as const) {
        const out = writeTextDocumentFile(document, type);
        if (!out.ok) throw new Error(out.rejection);
        const back = await read(out.bytes);
        expect(run(back.document)?.suggested?.insertion).toMatchObject({
          at: AT,
          author: { name: 'Ada' },
        });
        expect(back.report.dropped.map((d) => d.reason)).not.toContain('suggestion-dangling');
      }
    },
  );

  it('holds a story’s suggestion in the live state, read with the tab that shows it', () => {
    for (const document of [headed('odf'), noted('odf')]) {
      const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
      const [found] = LiveSuggestions.read(doc);
      expect(found).toMatchObject({ id: 's1', tab: 't.0', author: { name: 'Ada' } });
      expect(found?.story).toBeDefined();
    }
  });
});
