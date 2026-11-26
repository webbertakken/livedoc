// docs/specs/034-text-documents/review.md "How a suggestion is kept" ("In the files"), standard-mapping.md
// "Suggestions": Word's tracked changes read as suggestions from the file (runs inside `w:ins` / `w:del` and moves,
// a run's `w:rPrChange`, a paragraph's `w:pPrChange`, a paragraph mark's change as the next paragraph's break or join),
// never kept twice, written back as Word writes them, one LiveDoc suggestion reading back as one; a change in a story
// settled and reported.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Inline, Paragraph, Run } from './model/blocks';
import { UNKNOWN_SUGGESTION_AUTHOR } from './model/suggestions';
import type { TextDocument } from './model/text-document';
import { docx, W_P, W_R } from './testing/packages';
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
