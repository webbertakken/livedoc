// docs/specs/034-text-documents/files-and-print.md "Downloading": Rich Text written from the model, each paragraph's
// formatting whole, list markers as drawn, tables with their merged cells, pictures, footnotes; ASCII throughout.
import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { ListDefinition } from '../model/lists';
import type { Picture } from '../model/pictures';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { GREEN_PNG, GREEN_PNG_SHA } from '../testing/pictures';
import { writeRtf } from './rtf';
import { rtfText } from './rtf-tables';

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
/** The writing after the header, the page setup line and the closing brace left out. */
const bodyOf = (document: TextDocument) => {
  const rtf = writeRtf(document);
  return rtf.slice(rtf.indexOf('\n', rtf.indexOf('\\paperw')) + 1, -2);
};
/** The Normal text paragraph's opening, as the blank document's styles give it. */
const NORMAL = '\\pard\\plain\\s0\\sl276\\slmult1';
const RUN = '{\\f0\\fs22 ';

describe('the Rich Text of every construct', () => {
  it.each(Object.keys(CONSTRUCTS))('writes %s in ASCII', (name) => {
    const rtf = writeRtf(CONSTRUCTS[name]!('odf'));
    expect(rtf).toMatch(/^\{\\rtf1\\ansi/);
    expect(/^[\x20-\x7e\n]*$/.test(rtf)).toBe(true);
    expect(rtf).toMatchSnapshot();
  });
});

describe('rtfText', () => {
  it('escapes markup, tabs and breaks, and writes past ASCII as Unicode escapes', () => {
    expect(rtfText('a\\b{c}\td\ne')).toBe('a\\\\b\\{c\\}\\tab d\\line e');
    expect(rtfText('é€😀')).toBe('\\u233?\\u8364?\\u-10179?\\u-8704?');
  });
});

describe('writeRtf', () => {
  it('opens with its fonts, colours, styles and page', () => {
    const rtf = writeRtf(doc([p([run('x', { color: '#FF0000', font: 'Georgia' })])]));
    expect(rtf.split('\n').slice(0, 5)).toEqual([
      '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1',
      '{\\fonttbl{\\f0\\fnil Arial;}{\\f1\\fnil Georgia;}}',
      '{\\colortbl;\\red255\\green0\\blue0;}',
      expect.stringMatching(/^\{\\stylesheet\{\\s0 Normal;\}\{\\s1\\outlinelevel0 heading 1;\}/),
      '\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440',
    ]);
  });

  it('writes a paragraph’s formatting whole and its runs gathered', () => {
    expect(
      bodyOf(
        doc([
          p(
            [
              run('a', { bold: true }),
              run('b', { bold: true }),
              run('c', {
                italic: true,
                underline: true,
                strike: true,
                vertical: 'sub',
                smallCaps: true,
              }),
              run('d', { highlight: '#ffff00', transform: 'uppercase', size: 9.5 }),
            ],
            { props: { align: 'center', indentStart: 36, indentFirst: -18, spaceBefore: 6 } },
          ),
          p([run('H')], { style: id('heading2') }),
        ]),
      ),
    ).toBe(
      `\\pard\\plain\\s0\\qc\\li720\\fi-360\\sb120\\sl276\\slmult1\n` +
        `{\\f0\\fs22\\b ab}{\\f0\\fs22\\i\\ul\\strike\\sub\\scaps c}{\\f0\\fs19\\highlight1\\caps d}\\par\n` +
        `\\pard\\plain\\s2\\sb360\\sa120\\sl276\\slmult1\\outlinelevel1\n{\\f0\\fs32 H}\\par\n`,
    );
  });

  it('links to the web and to a bookmark it holds; anything else stays text', () => {
    const body = bodyOf(
      doc([
        p([
          run('web', {}, { link: 'https://docs.nu/?q="x"' }),
          run(' gone', {}, { link: '#missing' }),
          run(' here', {}, { link: '#mark' }),
        ]),
        p([{ type: 'bookmark', name: 'mark', props: {} }, run('T')]),
      ]),
    );
    expect(body).toBe(
      `${NORMAL}\n{\\field{\\*\\fldinst{HYPERLINK "https://docs.nu/?q=\\\\"x\\\\""}}{\\fldrslt ${RUN}web}}}${RUN} gone}` +
        `{\\field{\\*\\fldinst{HYPERLINK \\\\l "mark"}}{\\fldrslt ${RUN} here}}}\\par\n` +
        `${NORMAL}\n${RUN}{\\*\\bkmkstart mark}{\\*\\bkmkend mark}T}\\par\n`,
    );
  });

  it('writes a list item’s marker as drawn under a hanging indent', () => {
    const lists = { n: ListDefinition.of('number'), c: ListDefinition.of('check') };
    const body = bodyOf(
      doc(
        [
          p([run('one')], { list: { id: 'n', level: 0 } }),
          p([run('deep')], { list: { id: 'n', level: 1 } }),
          p([run('done')], { list: { id: 'c', level: 0, checked: true } }),
        ],
        { lists },
      ),
    );
    expect(body).toBe(
      `${NORMAL}\\li360\\fi-360\n${RUN}1.\\tab}${RUN}one}\\par\n` +
        `${NORMAL}\\li720\\fi-360\n${RUN}a.\\tab}${RUN}deep}\\par\n` +
        `${NORMAL}\\li360\\fi-360\n${RUN}\\u9745?\\tab}${RUN}done}\\par\n`,
    );
  });

  it('writes a table with its widths, header rows, merged cells and backgrounds', () => {
    const cell = (text: string, extra = {}) => ({ blocks: [p([run(text)])], props: {}, ...extra });
    const body = bodyOf(
      doc([
        {
          type: 'table',
          columns: [72, 36],
          headerRows: 1,
          rows: [
            { cells: [cell('H', { colSpan: 2 })] },
            { cells: [cell('a', { rowSpan: 2, props: { background: '#eeeeee' } }), cell('b')] },
            { cells: [cell('c')] },
          ],
        },
      ]),
    );
    const IN = '\\pard\\plain\\intbl\\s0\\sl276\\slmult1\n';
    expect(body).toBe(
      `\\trowd\\trgaph108\\trleft0\\trhdr\\cellx2160\n${IN}${RUN}H}\\cell\n\\row\n` +
        `\\trowd\\trgaph108\\trleft0\\clvmgf\\clcbpat1\\cellx1440\\cellx2160\n${IN}${RUN}a}\\cell\n${IN}${RUN}b}\\cell\n\\row\n` +
        `\\trowd\\trgaph108\\trleft0\\clvmrg\\cellx1440\\cellx2160\n\\pard\\plain\\intbl\\cell\n${IN}${RUN}c}\\cell\n\\row\n`,
    );
  });

  it('writes a PNG at its size and crop, another kind as its alt text', () => {
    const picture = (extra: Partial<Picture>): Picture => ({
      type: 'picture',
      media: GREEN_PNG_SHA,
      width: 60,
      height: 30,
      props: {},
      ...extra,
    });
    const body = bodyOf(
      doc(
        [
          p([
            picture({ crop: { top: 0, right: 0, bottom: 0.25, left: 0.5 } }),
            picture({ media: 'gif', alt: 'Moving' }),
            picture({ media: 'unread', decorative: true }),
          ]),
        ],
        {
          media: {
            [GREEN_PNG_SHA]: { mediaType: 'image/png', bytes: GREEN_PNG },
            gif: { mediaType: 'image/gif', bytes: new Uint8Array([0x47]) },
          },
        },
      ),
    );
    expect(body).toContain(
      `{\\pict\\pngblip\\picw160\\pich53\\picwgoal2400\\pichgoal800\\piccropb200\\piccropl1200\n${[...GREEN_PNG.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')}`,
    );
    expect(body).toContain('[Moving]}\\par\n');
  });

  it('writes a footnote as the format’s own, an equation as its linear text', () => {
    const body = bodyOf(
      doc([
        p([
          run('Claim'),
          { type: 'note', blocks: [p([run('Source.')])], props: {} },
          {
            type: 'equation',
            math: [{ kind: 'identifier', text: 'x' }],
            props: {},
          },
        ]),
      ]),
    );
    expect(body).toBe(
      `${NORMAL}\n${RUN}Claim{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn}${NORMAL}\n${RUN}Source.}}x}\\par\n`,
    );
  });

  it('heads each document tab’s writing with its name when there are several', () => {
    expect(writeRtf(CONSTRUCTS.tabs!('odf')).match(/\{\\f0\\fs\d+ Details\}/g)).toHaveLength(2);
  });
});
