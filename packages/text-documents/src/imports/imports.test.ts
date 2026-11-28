// docs/specs/034-text-documents/files-and-print.md "Opening": Plain Text and Markdown imported into a new ODF text
// document under the document's limits, a picture never fetched and reported.
import { describe, expect, it } from 'vitest';
import { importTypeOfFileName } from '../file-types';
import { Paragraph, type Block } from '../model/blocks';
import { CodeBlocks } from '../model/code-blocks';
import { Styles } from '../model/styles';
import { readTextDocumentImport } from './import-file';
import { codeLanguageOf } from './markdown';

const encode = (text: string) => new TextEncoder().encode(text);
const read = async (text: string | Uint8Array, type: 'txt' | 'md', maxChars?: number) => {
  const result = await readTextDocumentImport(
    typeof text === 'string' ? encode(text) : text,
    type,
    maxChars === undefined ? {} : { maxChars },
  );
  if (!result.ok) throw new Error(result.rejection);
  return result;
};
const texts = (blocks: readonly Block[]) =>
  blocks.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : `<${b.type}>`));

describe('importTypeOfFileName', () => {
  it('names Plain Text, Markdown and HTML by their extensions', () => {
    expect(
      ['a.txt', 'b.MD', 'c.markdown', 'd.docx', 'e', '.txt.odt', 'f.HTM', 'g.html'].map(
        importTypeOfFileName,
      ),
    ).toEqual(['txt', 'md', 'md', undefined, undefined, undefined, 'html', 'html']);
  });
});

describe('readTextDocumentImport as Plain Text', () => {
  it('makes a Normal text paragraph a line in a new ODF document, tabs kept', async () => {
    const { document, fileType, report } = await read('\uFEFFone\r\ntwo\tcols\rthree\n', 'txt');
    expect(fileType).toBe('odt');
    expect(document.format).toBe('odf');
    expect(texts(document.body)).toEqual(['one', 'two\tcols', 'three', '']);
    expect(report).toEqual({ dropped: [], kept: [] });
  });

  it('reads a file that is not UTF-8 as Windows’ Western encoding', async () => {
    expect(
      texts((await read(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), 'txt')).document.body),
    ).toEqual(['café']);
  });

  it('refuses a binary file, and one past the character limit', async () => {
    expect(await readTextDocumentImport(new Uint8Array([0x50, 0x4b, 0, 3]), 'txt')).toEqual({
      ok: false,
      rejection: 'package_wrong_type',
    });
    expect(await readTextDocumentImport(encode('abcdef'), 'txt', { maxChars: 5 })).toMatchObject({
      rejection: 'document_too_large',
    });
    expect(
      await readTextDocumentImport(encode('a'.repeat(20)), 'md', { maxChars: 5 }),
    ).toMatchObject({
      rejection: 'document_too_large',
    });
  });
});

describe('readTextDocumentImport as Markdown', () => {
  it('reads headings, formatting and safe links', async () => {
    const { document } = await read(
      '# Plan\n\nSome **bold** [site](https://docs.nu) [bad](javascript:x)',
      'md',
    );
    const [heading, body] = document.body as Paragraph[];
    expect(heading!.style).toBe(Styles.idOfRole(document.styles, 'heading1'));
    expect(body!.inlines).toEqual([
      { type: 'run', text: 'Some ', props: {} },
      { type: 'run', text: 'bold', props: { bold: true } },
      { type: 'run', text: ' ', props: {} },
      { type: 'run', text: 'site', props: {}, link: 'https://docs.nu' },
      { type: 'run', text: ' [bad](javascript:x)', props: {} },
    ]);
  });

  it('makes a list a Markdown list, numbered from its start, levels drawn as their items ask', async () => {
    const { document } = await read(
      '3. three\n4. four\n    - deep\n\n- [x] done\n- [ ] open',
      'md',
    );
    const places = (document.body as Paragraph[]).map((p) => p.list);
    expect(places).toEqual([
      { id: 'L1', level: 0, restart: 3 },
      { id: 'L1', level: 0 },
      { id: 'L1', level: 1 },
      { id: 'L2', level: 0, checked: true },
      { id: 'L2', level: 0, checked: false },
    ]);
    expect(document.lists.L1!.levels[0]!.kind).toBe('number');
    expect(document.lists.L1!.levels[1]!.kind).toBe('bullet');
    expect(document.lists.L2!.levels[0]!.kind).toBe('check');
  });

  it('writes a code block a line a paragraph in its language’s style', async () => {
    const { document } = await read('```py\nif x:\n    y\n```\n\n```\n```', 'md');
    const languages = (document.body as Paragraph[]).map(
      (p) => CodeBlocks.of(document.styles, p.style)?.language,
    );
    expect(languages).toEqual(['python', 'python', null]);
    expect(texts(document.body)).toEqual(['if x:', '    y', '']);
  });

  it('names a fence’s language by id, label or a common name', async () => {
    expect(['TypeScript', 'js', 'sql', 'brainfuck', null].map(codeLanguageOf)).toEqual([
      'typescript',
      'javascript',
      'sql',
      null,
      null,
    ]);
  });

  it('makes a pipe table with its first row the header, across the page', async () => {
    const { document } = await read('| a | b |\n| - | - |\n| 1 |', 'md');
    const table = document.body[0]!;
    if (table.type !== 'table') throw new Error('no table');
    expect(table.headerRows).toBe(1);
    expect(table.columns.reduce((a, b) => a + b, 0)).toBeCloseTo(468);
    expect(table.rows.map((r) => r.cells.map((c) => texts(c.blocks)[0]))).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('keeps a picture as its alt text, never fetched, and reports it', async () => {
    const { document, report } = await read('![A cat](https://x.y/c.png) and ![](u.png)', 'md');
    expect(texts(document.body)).toEqual(['[A cat] and [Picture]']);
    expect(report.dropped).toEqual([{ reason: 'external', name: 'remote picture', count: 2 }]);
  });

  it('makes an empty file one empty paragraph', async () => {
    expect(texts((await read('', 'md')).document.body)).toEqual(['']);
  });
});
