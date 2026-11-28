// docs/specs/034-text-documents/files-and-print.md "Downloading": the Web Page, written from the model as semantic
// markup with a stylesheet, its pictures beside it in a zip; every page well-formed.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { ListDefinition } from '../model/lists';
import type { Picture } from '../model/pictures';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { unzipped } from '../testing/unzipped';
import { BLUE_PNG, BLUE_PNG_SHA, GREEN_PNG, GREEN_PNG_SHA } from '../testing/pictures';
import { exportStylesheet } from './html-style';
import { writeTextDocumentExport } from './text-document-exports';
import { webPageHtml } from './web-page';

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
const picture = (media: string, extra: Partial<Picture> = {}): Picture => ({
  type: 'picture',
  media,
  width: 30,
  height: 15,
  props: {},
  ...extra,
});
const media = {
  [GREEN_PNG_SHA]: { mediaType: 'image/png' as const, bytes: GREEN_PNG },
  [BLUE_PNG_SHA]: { mediaType: 'image/png' as const, bytes: BLUE_PNG },
};

/** The page's body, between its tags. */
const bodyOf = (document: TextDocument) =>
  /<body>\n?([\s\S]*?)\n?<\/body>/.exec(webPageHtml(document).html)![1]!;

describe('the Web Page of every construct', () => {
  it.each(Object.keys(CONSTRUCTS))('writes %s as a well-formed page', (name) => {
    const { html } = webPageHtml(CONSTRUCTS[name]!('odf'));
    expect(parseXml(html.replace(/^<!DOCTYPE html>\n/, '')).ok).toBe(true);
    expect(html).toMatchSnapshot();
  });
});

describe('webPageHtml', () => {
  it('heads a page with its language, name and stylesheet', () => {
    const { html } = webPageHtml(
      doc([p([run('Hi')])], { metadata: { title: 'A & B', language: 'nl-NL' } }),
    );
    expect(html).toContain('<html xmlns="http://www.w3.org/1999/xhtml" lang="nl-NL">');
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html).toContain("body { font-family: 'Arial'; font-size: 11pt; line-height: 1.15; }");
    expect(webPageHtml(doc([])).html).toContain('lang="en"');
    expect(webPageHtml(doc([])).html).toContain('<title>Untitled</title>');
  });

  it('writes headings, the title and subtitle, and an empty paragraph as a line', () => {
    expect(
      bodyOf(
        doc([
          p([run('T')], { style: id('title') }),
          p([run('S')], { style: id('subtitle') }),
          p([run('H')], { style: id('heading2') }),
          p([]),
        ]),
      ),
    ).toBe('<p class="title">T</p>\n<p class="subtitle">S</p>\n<h2>H</h2>\n<p><br /></p>');
  });

  it('writes formatting as tags, the rest on a span, runs alike gathered', () => {
    expect(
      bodyOf(
        doc([
          p(
            [
              run('a', { bold: true }),
              run('b', { bold: true }),
              run('c', { italic: true, underline: true, strike: true, vertical: 'super' }),
              run('d', {
                color: '#FF0000',
                highlight: '#ffff00',
                size: 14,
                font: "Times'</style>",
              }),
              run('e\tf\ng'),
            ],
            { props: { align: 'center', indentStart: 36, spaceAfter: 6 } },
          ),
        ]),
      ),
    ).toBe(
      '<p style="text-align: center; margin-left: 36pt; margin-bottom: 6pt"><strong>ab</strong><em><u><s><sup>c</sup></s></u></em>' +
        '<span style="color: #ff0000; background-color: #ffff00; font-family: &apos;Timesstyle&apos;; font-size: 14pt">d</span>'.replace(
          /&apos;/g,
          "'",
        ) +
        'e<span class="tab">\t</span>f<br />g</p>',
    );
  });

  it('links to the web and to a bookmark it holds; anything else stays text', () => {
    const body = bodyOf(
      doc([
        p([
          run('web', {}, { link: 'https://docs.nu/?a=1&b=2' }),
          run(' gone', {}, { link: '#missing' }),
          run(' bad', {}, { link: 'javascript:alert(1)' }),
          run(' here', {}, { link: '#mark' }),
        ]),
        p([{ type: 'bookmark', name: 'mark', props: {} }, run('Target')]),
      ]),
    );
    expect(body).toBe(
      '<p><a href="https://docs.nu/?a=1&amp;b=2">web</a> gone bad<a href="#mark"> here</a></p>\n<p><a id="mark"></a>Target</p>',
    );
  });

  it('nests lists by level, numbers in their own type and start, checklists ticked or not', () => {
    const lists = {
      n: {
        levels: [
          { kind: 'number' as const, format: 'decimal' as const, label: '%1.', start: 3 },
          { kind: 'number' as const, format: 'lower-roman' as const, label: '%2.', start: 1 },
        ],
      },
      b: ListDefinition.of('bullet'),
      c: ListDefinition.of('check'),
    };
    const at = (list: string, level = 0, extra = {}) => ({ id: list, level, ...extra });
    const body = bodyOf(
      doc(
        [
          p([run('one')], { list: at('n') }),
          p([run('deep')], { list: at('n', 1) }),
          p([run('two')], { list: at('n') }),
          p([run('bullet')], { list: at('b') }),
          p([run('done')], { list: at('c', 0, { checked: true }) }),
          p([run('todo')], { list: at('c') }),
          p([run('after')]),
        ],
        { lists },
      ),
    );
    expect(body).toBe(
      '<ol type="1" start="3"><li>one<ol type="i"><li>deep</li></ol></li><li>two</li></ol>' +
        '<ul><li>bullet</li></ul>' +
        '<ul><li class="check"><input type="checkbox" disabled="disabled" checked="checked" /> done</li>' +
        '<li class="check"><input type="checkbox" disabled="disabled" /> todo</li></ul>\n<p>after</p>',
    );
  });

  it('numbers an item that starts its level again by its value', () => {
    const lists = { n: ListDefinition.of('number') };
    const body = bodyOf(
      doc(
        [
          p([run('a')], { list: { id: 'n', level: 0 } }),
          p([run('b')], { list: { id: 'n', level: 0, restart: 7 } }),
        ],
        { lists },
      ),
    );
    expect(body).toBe('<ol type="1"><li>a</li><li value="7">b</li></ol>');
  });

  it('writes a table with its header rows, merged cells and backgrounds', () => {
    const cell = (text: string, extra = {}) => ({ blocks: [p([run(text)])], props: {}, ...extra });
    const body = bodyOf(
      doc([
        {
          type: 'table',
          columns: [72, 72],
          headerRows: 1,
          rows: [
            { cells: [cell('H', { colSpan: 2 })] },
            { cells: [cell('a', { rowSpan: 2, props: { background: '#eeeeee' } }), cell('b')] },
            { cells: [cell('c')] },
          ],
        },
      ]),
    );
    expect(body).toBe(
      '<table><colgroup><col style="width: 72pt" /><col style="width: 72pt" /></colgroup>' +
        '<thead><tr><th colspan="2"><p>H</p></th></tr></thead>' +
        '<tbody><tr><td rowspan="2" style="background-color: #eeeeee"><p>a</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td></tr></tbody></table>',
    );
  });

  it('gathers a code block’s lines under its language', () => {
    const document = doc([]);
    const code = {
      id: 'Code_20__28_Python_29_',
      name: 'Code (Python)',
      family: 'paragraph' as const,
      paragraph: {},
      text: {},
    };
    const body = bodyOf({
      ...document,
      styles: [...document.styles, code],
      body: [p([run('if a < b:')], { style: code.id }), p([run('  pass')], { style: code.id })],
    });
    expect(body).toBe('<pre><code class="language-python">if a &lt; b:\n  pass</code></pre>');
  });

  it('writes pictures as drawn: size, alt text, crop, turn and colours; an unread one as its alt text', () => {
    const { html, pictures } = webPageHtml(
      doc(
        [
          p([
            picture(GREEN_PNG_SHA, { alt: 'Field "green"' }),
            picture(GREEN_PNG_SHA, { decorative: true, rotation: 90 }),
            picture(BLUE_PNG_SHA, {
              alt: 'Blue',
              crop: { top: 0.5, right: 0, bottom: 0, left: 0.25 },
              recolour: { kind: 'greyscale' },
              transparency: 50,
            }),
            picture('unread', { alt: 'Gone' }),
          ]),
        ],
        { media },
      ),
    );
    expect(pictures.used().map((pic) => pic.path)).toEqual(['images/1.png', 'images/2.png']);
    expect(html).toContain(
      '<img src="images/1.png" alt="Field &quot;green&quot;" width="40" height="20" />',
    );
    expect(html).toContain(
      '<span class="turn" style="display: inline-block; transform: rotate(90deg)"><img src="images/1.png" alt="" width="40" height="20" /></span>',
    );
    expect(html).toContain(
      '<filter id="c1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="',
    );
    expect(html).toContain(
      '<span class="crop" style="width: 40px; height: 20px"><img src="images/2.png" alt="Blue" style="width: 53px; height: 40px; max-width: none; margin-left: -13px; margin-top: -20px; filter: url(#c1); opacity: 0.5" /></span>',
    );
    expect(html).toContain('[Gone]</p>');
  });

  it('numbers footnotes, linking each to its note and back', () => {
    const body = bodyOf(
      doc([p([run('Claim'), { type: 'note', blocks: [p([run('Source.')])], props: {} }])]),
    );
    expect(body).toBe(
      '<p>Claim<sup><a href="#fn1" id="fnref1">1</a></sup></p>\n' +
        '<section class="footnotes"><ol><li id="fn1"><p>Source.</p> <a href="#fnref1">↩</a></li></ol></section>',
    );
  });

  it('heads each document tab’s writing with its name when there are several', () => {
    const document = CONSTRUCTS.tabs!('odf');
    expect(bodyOf(document).match(/<h1>[^<]*<\/h1>/g)?.length).toBeGreaterThan(1);
  });

  it('keeps a font name and colours from breaking out of the stylesheet', () => {
    const document = doc([]);
    const sheet = exportStylesheet({
      ...document,
      defaults: { ...document.defaults, text: { font: 'A;}</style><script>', color: 'red;x' } },
    });
    expect(sheet).toContain("font-family: 'Astylescript'");
    expect(sheet).not.toContain('red');
  });
});

describe('writeTextDocumentExport as a Web Page', () => {
  it('zips the page named after the document with each picture once', async () => {
    const bytes = writeTextDocumentExport(
      doc([p([picture(GREEN_PNG_SHA), picture(GREEN_PNG_SHA)])], {
        media,
        metadata: { title: 'Report: Q4' },
      }),
      'html',
      { when: new Date('2026-11-28T10:00:00Z') },
    );
    const files = await unzipped(bytes);
    expect([...files.keys()]).toEqual(['Report  Q4.html'.replace('  ', ' '), 'images/1.png']);
    expect(files.get('images/1.png')).toEqual(GREEN_PNG);
  });
});
