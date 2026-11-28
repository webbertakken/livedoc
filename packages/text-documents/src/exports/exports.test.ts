// docs/specs/034-text-documents/files-and-print.md "Downloading": Plain Text and Markdown written from the model, every
// document tab in order, suggestions accepted, nothing of the writing lost that the format can say.
import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { ListDefinition } from '../model/lists';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { TextDocumentState } from '../text-document-state';
import { escapeMarkdown, writeMarkdown } from './markdown';
import { writePlainText } from './plain-text';
import { settledDocument, writeTextDocumentExport } from './text-document-exports';

const styles = Styles.builtIn('odf');
const id = (role: Parameters<typeof Styles.idOfRole>[1]) => Styles.idOfRole(styles, role)!;
const run = (text: string, props = {}, extra = {}): Inline => ({
  type: 'run',
  text,
  props,
  ...extra,
});
const p = (inlines: Inline[], extra: Partial<Paragraph> = {}): Paragraph => ({
  type: 'paragraph',
  style: id('normal'),
  props: {},
  inlines,
  ...extra,
});
const doc = (body: Block[], extra: Partial<TextDocument> = {}): TextDocument => ({
  ...TextDocument.blank({ format: 'odf' }),
  body,
  ...extra,
});

describe('the exports of every construct', () => {
  for (const name of Object.keys(CONSTRUCTS))
    it(`writes ${name} as Plain Text and Markdown`, () => {
      const document = CONSTRUCTS[name]!('odf');
      expect({ txt: writePlainText(document), md: writeMarkdown(document) }).toMatchSnapshot();
    });
});

describe('writePlainText', () => {
  it('writes a line a paragraph, list markers as drawn, a table by tabs, notes at the end', () => {
    const lists = { b: ListDefinition.of('bullet'), n: ListDefinition.of('number') };
    const text = writePlainText(
      doc(
        [
          p([run('Heading')], { style: id('heading1') }),
          p([run('one')], { list: { id: 'n', level: 0 } }),
          p([run('two')], { list: { id: 'n', level: 0 } }),
          p([run('deeper')], { list: { id: 'b', level: 1 } }),
          p([
            run('A claim'),
            { type: 'note', blocks: [p([run('The source.')])], props: {} },
            run('.'),
          ]),
          {
            type: 'table',
            columns: [100, 100],
            headerRows: 0,
            props: {},
            rows: [
              {
                cells: [
                  { blocks: [p([run('a\tb')])], props: {} },
                  { blocks: [p([run('c')]), p([run('d')])], props: {} },
                ],
              },
            ],
          } as Block,
        ],
        { lists },
      ),
    );
    expect(text).toBe(
      'Heading\n1. one\n2. two\n  ○ deeper\nA claim[1].\na b\tc d\n\n[1] The source.\n',
    );
  });

  it('heads each document tab’s writing with its name when there are two', () => {
    const document = CONSTRUCTS.tabs!('odf');
    const text = writePlainText(document);
    for (const tab of document.tabs!.more) expect(text).toContain(`\n${tab.name}\n`);
  });

  it('says a picture by its alt text, its title, or that it is one; a decorative one not at all', () => {
    const picture = (extra: object): Inline => ({
      type: 'picture',
      media: 'm',
      width: 1,
      height: 1,
      props: {},
      ...extra,
    });
    expect(
      writePlainText(
        doc([
          p([
            picture({ alt: 'A cat' }),
            picture({ title: 'Map' }),
            picture({}),
            picture({ decorative: true }),
          ]),
        ]),
      ),
    ).toBe('[A cat][Map][Picture]\n');
  });
});

describe('writeMarkdown', () => {
  it('writes headings by level, the title, the subtitle, and emphasis gathered across runs', () => {
    const md = writeMarkdown(
      doc([
        p([run('Doc')], { style: id('title') }),
        p([run('Sub')], { style: id('subtitle') }),
        p([run('Two')], { style: id('heading2') }),
        p([
          run('bold ', { bold: true }),
          run('still', { bold: true }),
          run(' plain '),
          run('it', { italic: true }),
        ]),
        p([
          run('gone', { strike: true }),
          run(' '),
          run('link', {}, { link: 'https://example.com/a b' }),
        ]),
        p([run('unsafe', {}, { link: 'javascript:alert(1)' }), run(' here', {}, { link: '#b1' })]),
      ]),
    );
    expect(md).toBe(
      '# Doc\n\n**Sub**\n\n## Two\n\n**bold still** plain *it*\n\n~~gone~~ [link](<https://example.com/a b>)\n\nunsafe here\n',
    );
  });

  it('nests lists, numbers them as drawn, ticks checklists and keeps them tight', () => {
    const lists = {
      b: ListDefinition.of('bullet'),
      n: ListDefinition.of('number'),
      c: ListDefinition.of('check'),
    };
    const md = writeMarkdown(
      doc(
        [
          p([run('one')], { list: { id: 'n', level: 0 } }),
          p([run('inner')], { list: { id: 'b', level: 1 } }),
          p([run('two')], { list: { id: 'n', level: 0 } }),
          p([run('done')], { list: { id: 'c', level: 0, checked: true } }),
          p([run('todo')], { list: { id: 'c', level: 0 } }),
          p([run('after')]),
        ],
        { lists },
      ),
    );
    expect(md).toBe('1. one\n    - inner\n2. two\n- [x] done\n- [ ] todo\n\nafter\n');
  });

  it('fences a code block with its language, longer than any backticks inside', () => {
    const code = { ...styles[0]!, id: 'CodePy', name: 'Code (Python)', role: undefined };
    const md = writeMarkdown(
      doc([p([run('print("```")\nx = 1')], { style: 'CodePy' })], { styles: [...styles, code] }),
    );
    expect(md).toBe('````python\nprint("```")\nx = 1\n````\n');
  });

  it('writes a table as a pipe table, a merged cell’s places empty, pipes escaped', () => {
    const md = writeMarkdown(
      doc([
        {
          type: 'table',
          columns: [1, 1, 1],
          headerRows: 1,
          props: {},
          rows: [
            {
              cells: [
                { blocks: [p([run('A|B')])], props: {}, colSpan: 2 },
                { blocks: [p([run('C')])], props: {} },
              ],
            },
            { cells: [{ blocks: [p([run('1')]), p([run('2')])], props: {} }] },
          ],
        } as Block,
      ]),
    );
    expect(md).toBe('| A\\|B |  | C |\n| --- | --- | --- |\n| 1<br>2 |  |  |\n');
  });

  it('writes footnotes as references and their definitions, an equation between dollars', () => {
    const md = writeMarkdown(
      doc([
        p([
          run('Claim'),
          {
            type: 'note',
            blocks: [p([run('Source, ', {}), run('bold', { bold: true })])],
            props: {},
          },
          run(' '),
          { type: 'equation', math: [{ kind: 'identifier', text: 'x' }], props: {} },
        ]),
      ]),
    );
    expect(md).toContain('Claim[^1] $');
    expect(md).toMatch(/\n\n\[\^1\]: Source, \*\*bold\*\*\n$/);
  });

  it('escapes a backslash and a dollar inside an equation, so neither ends it', () => {
    const math = [
      { kind: 'text' as const, text: 'a\\' },
      { kind: 'operator' as const, text: '$' },
    ];
    expect(writeMarkdown(doc([p([{ type: 'equation', math, props: {} }])]))).toBe(
      '$a\\\\\\$$\n',
    );
  });

  it('writes a line break as a hard break', () => {
    expect(writeMarkdown(doc([p([run('one\ntwo')])]))).toBe('one\\\ntwo\n');
  });

  it('escapes what would read as Markdown', () => {
    expect(escapeMarkdown('# not a heading')).toBe('\\# not a heading');
    expect(escapeMarkdown('- not a list\n1. nor this')).toBe('\\- not a list\n1\\. nor this');
    expect(escapeMarkdown('*a* _b_ [c] <d> `e` | ~ $ \\')).toBe(
      '\\*a\\* \\_b\\_ \\[c\\] \\<d\\> \\`e\\` \\| \\~ \\$ \\\\',
    );
    expect(escapeMarkdown('a-b 2.5')).toBe('a-b 2.5');
  });

  it('writes an empty document as an empty line', () => {
    expect(writeMarkdown(doc([p([])]))).toBe('\n');
    expect(writePlainText(doc([]))).toBe('\n');
  });
});

describe('writeTextDocumentExport and settledDocument', () => {
  it('writes UTF-8 bytes of the type asked for', () => {
    const document = doc([p([run('Één ✓')])]);
    expect(new TextDecoder().decode(writeTextDocumentExport(document, 'txt'))).toBe('Één ✓\n');
    expect(new TextDecoder().decode(writeTextDocumentExport(document, 'md'))).toBe('Één ✓\n');
  });

  it('reads the document with every pending suggestion accepted, the state untouched', () => {
    const document = CONSTRUCTS.suggestions!('odf');
    const live = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const before = JSON.stringify(TextDocumentState.document(live, 'odf'));
    const settled = settledDocument(live, 'odf');
    expect(JSON.stringify(settled)).not.toContain('"insertion"');
    expect(JSON.stringify(TextDocumentState.document(live, 'odf'))).toBe(before);
  });
});
