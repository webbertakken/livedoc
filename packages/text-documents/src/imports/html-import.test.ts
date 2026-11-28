// docs/specs/034-text-documents/files-and-print.md "Opening", "Import security": HTML read as a browser reads it into a
// new ODF text document; what runs is never read and is reported; a picture is never fetched.
import { describe, expect, it } from 'vitest';
import { webPageHtml } from '../exports/web-page';
import { Paragraph, type Block } from '../model/blocks';
import { CodeBlocks } from '../model/code-blocks';
import { DocumentTabs } from '../model/document-tabs';
import { Pictures } from '../model/pictures';
import { Blocks } from '../model/tables';
import { Styles } from '../model/styles';
import type { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { GREEN_PNG } from '../testing/pictures';
import { readTextDocumentImport } from './import-file';

const read = async (html: string) => {
  const result = await readTextDocumentImport(new TextEncoder().encode(html), 'html');
  if (!result.ok) throw new Error(result.rejection);
  return result;
};
const texts = (blocks: readonly Block[]) =>
  blocks.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : `<${b.type}>`));
const paragraphs = (document: TextDocument) => document.body as Paragraph[];
const words = (text: string) => text.match(/\p{L}+/gu) ?? [];

describe('readTextDocumentImport as HTML', () => {
  it('reads headings and paragraphs, white space collapsed, its language kept', async () => {
    const { document } = await read(
      '<!doctype html><html lang="nl"><head><title>T</title><style>p{}</style></head><body><h2>Head</h2><p>  one\n  two </p><div>three<p>four</p>five</div></body></html>',
    );
    expect(texts(document.body)).toEqual(['Head', 'one two', 'three', 'four', 'five']);
    expect(document.body[0]!.type === 'paragraph' && document.body[0]!.style).toBe(
      Styles.idOfRole(document.styles, 'heading2'),
    );
    expect(document.metadata.language).toBe('nl');
  });

  it('reads formatting from tags, styles and fonts, and line breaks', async () => {
    const { document } = await read(
      '<p style="text-align:center;margin-left:24px"><b>B</b><em>I</em><u>U</u><s>S</s><sup>2</sup><span style="color:#f00;background-color:rgb(255,255,0);font-size:12pt;font-family:\'Georgia\', serif">C</span><font color="blue" face="Courier">F</font>a<br>b</p>',
    );
    const [p] = paragraphs(document);
    expect(p!.props).toEqual({ align: 'center', indentStart: 18 });
    expect(p!.inlines.map((i) => i.type === 'run' && [i.text, i.props])).toEqual([
      ['B', { bold: true }],
      ['I', { italic: true }],
      ['U', { underline: true }],
      ['S', { strike: true }],
      ['2', { vertical: 'super' }],
      ['C', { color: '#ff0000', highlight: '#ffff00', size: 12, font: 'Georgia' }],
      ['F', { color: '#0000ff', font: 'Courier' }],
      ['a\nb', {}],
    ]);
  });

  it('links safely, and reports an unsafe link, keeping its text', async () => {
    const { document, report } = await read(
      '<p><a href="https://docs.nu">site</a> <a href="javascript:alert(1)">bad</a></p>',
    );
    expect(paragraphs(document)[0]!.inlines).toEqual([
      { type: 'run', text: 'site', props: {}, link: 'https://docs.nu' },
      { type: 'run', text: ' bad', props: {} },
    ]);
    expect(report.dropped).toEqual([{ reason: 'link', name: 'unsafe link', count: 1 }]);
  });

  it('never reads scripts, frames, objects or form controls, and reports them', async () => {
    const { document, report } = await read(
      '<p>a<script>alert(1)</script><iframe src="x"></iframe>b<input value="v"><object></object><embed></p><noscript>n</noscript>',
    );
    expect(texts(document.body)).toEqual(['ab']);
    expect(report.dropped).toEqual([
      { reason: 'active-content', name: 'script', count: 1 },
      { reason: 'active-content', name: 'iframe', count: 1 },
      { reason: 'active-content', name: 'form control', count: 1 },
      { reason: 'active-content', name: 'object', count: 1 },
      { reason: 'active-content', name: 'embed', count: 1 },
    ]);
  });

  it('nests lists, numbers from start in their type, and reads checklists', async () => {
    const { document } = await read(
      '<ol start="3" type="a"><li>three<ul><li>deep</li></ul></li><li>four</li></ol><ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> open</li></ul>',
    );
    expect(paragraphs(document).map((p) => [Paragraph.text(p), p.list])).toEqual([
      ['three', { id: 'L1', level: 0, restart: 3 }],
      ['deep', { id: 'L1', level: 1 }],
      ['four', { id: 'L1', level: 0 }],
      ['done', { id: 'L2', level: 0, checked: true }],
      ['open', { id: 'L2', level: 0, checked: false }],
    ]);
    const l1 = document.lists.L1!.levels;
    expect([l1[0]!.kind, l1[0]!.kind === 'number' && l1[0]!.format, l1[1]!.kind]).toEqual([
      'number',
      'lower-letter',
      'bullet',
    ]);
    expect(document.lists.L2!.levels[0]!.kind).toBe('check');
  });

  it('indents a quote, and reads a code block a line a paragraph in its language', async () => {
    const { document } = await read(
      '<blockquote><p>Said</p></blockquote><pre><code class="language-ts">let a = 1;\n  a &lt; 2;\n</code></pre>',
    );
    const [quote, ...code] = paragraphs(document);
    expect(quote!.props.indentStart).toBe(36);
    expect(
      code.map((p) => [Paragraph.text(p), CodeBlocks.of(document.styles, p.style)?.language]),
    ).toEqual([
      ['let a = 1;', 'typescript'],
      ['  a < 2;', 'typescript'],
    ]);
  });

  it('reads a table with its header rows, merged cells and backgrounds', async () => {
    const { document } = await read(
      '<table><thead><tr><th colspan="2">H</th></tr></thead><tbody><tr><td rowspan="2" style="background-color:#eee">a</td><td>b</td></tr><tr><td></td></tr></tbody></table>',
    );
    const table = document.body[0]!;
    if (table.type !== 'table') throw new Error('no table');
    expect(table.headerRows).toBe(1);
    expect(table.columns).toHaveLength(2);
    expect(
      table.rows.map((r) =>
        r.cells.map((c) => [texts(c.blocks)[0], c.colSpan, c.rowSpan, c.props]),
      ),
    ).toEqual([
      [['H', 2, undefined, {}]],
      [
        ['a', undefined, 2, { background: '#eeeeee' }],
        ['b', undefined, undefined, {}],
      ],
      [['', undefined, undefined, {}]],
    ]);
  });

  it('counts leading rows of header cells as header rows when there is no head', async () => {
    const { document } = await read('<table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
    expect(document.body[0]!.type === 'table' && document.body[0]!.headerRows).toBe(1);
  });

  it('reads a picture from the page’s own bytes; a remote one stays its alt text, never fetched', async () => {
    const data = `data:image/png;base64,${btoa(String.fromCharCode(...GREEN_PNG))}`;
    const { document, report } = await read(
      `<p><img src="${data}" alt="Field" width="40"><img src="${data}" alt=""><img src="https://x.y/a.png" alt="Remote"><img src="data:image/png;base64,AAAA" alt="Broken"></p>`,
    );
    const pictures = Pictures.ofDocument(document);
    expect(pictures).toHaveLength(2);
    expect(pictures[0]).toMatchObject({ alt: 'Field', width: 30 });
    expect(pictures[1]!.decorative).toBe(true);
    expect(pictures[0]!.media).toMatch(/^[0-9a-f]{64}$/);
    expect(Pictures.heldBytes(document, pictures[0]!.media)?.bytes).toEqual(GREEN_PNG);
    expect(texts(document.body)).toEqual(['[Remote][Broken]']);
    expect(report.dropped).toEqual([
      { reason: 'external', name: 'remote picture', count: 1 },
      { reason: 'external', name: 'unreadable picture', count: 1 },
    ]);
  });

  it('makes an empty page one empty paragraph', async () => {
    expect(texts((await read('')).document.body)).toEqual(['']);
  });
});

// A LiveDoc Web Page read back: every construct's paragraphs keep their words, in order. What HTML cannot say (a list
// marker's label, footnotes in place) may come back elsewhere; tab names, alt text and equations' text may come in.
const inOrder = (part: readonly string[], whole: readonly string[]) => {
  let at = 0;
  for (const word of part) {
    while (at < whole.length && whole[at] !== word) at += 1;
    if (at === whole.length) return false;
    at += 1;
  }
  return true;
};

describe('a Web Page LiveDoc wrote, imported again', () => {
  it.each(Object.keys(CONSTRUCTS))('keeps the words of %s', async (name) => {
    const original = CONSTRUCTS[name]!('odf');
    const { document } = await read(webPageHtml(original).html);
    const body = (d: TextDocument) =>
      DocumentTabs.all(d).flatMap((tab) =>
        words(Blocks.paragraphs(tab.body).map(Paragraph.text).join(' ')),
      );
    expect(inOrder(body(original), body(document))).toBe(true);
  });
});
