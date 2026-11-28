// docs/specs/034-text-documents/files-and-print.md "Opening": Rich Text read into a new ODF text document: paragraphs,
// runs, headings, lists, tables with their merges, pictures, footnotes, links and bookmarks; what it cannot hold is
// reported.
import { describe, expect, it } from 'vitest';
import { writeRtf } from '../exports/rtf';
import { Paragraph, type Block, type Inline } from '../model/blocks';
import { DocumentTabs } from '../model/document-tabs';
import { Pictures } from '../model/pictures';
import { Styles } from '../model/styles';
import { Blocks } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { GREEN_PNG } from '../testing/pictures';
import { readTextDocumentImport } from './import-file';
import { rtfTokens } from './rtf-tokens';

const read = async (rtf: string) => {
  const result = await readTextDocumentImport(
    Uint8Array.from(rtf, (c) => c.charCodeAt(0) & 0xff),
    'rtf',
  );
  if (!result.ok) throw new Error(result.rejection);
  return result;
};
const texts = (blocks: readonly Block[]) =>
  blocks.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : `<${b.type}>`));
const runs = (inlines: readonly Inline[]) =>
  inlines.map((i) => (i.type === 'run' ? [i.text, i.props] : i.type));
const rtf = (body: string) =>
  `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Arial;}{\\f1 Georgia;}}{\\colortbl;\\red255\\green0\\blue0;\\red238\\green238\\blue238;}{\\stylesheet{\\s0 Normal;}{\\s1\\outlinelevel0 heading 1;}{\\s9 Title;}}\n${body}}`;

describe('rtfTokens', () => {
  it('reads groups, words with numbers, symbols, hex bytes, raw bytes and text', () => {
    expect([...rtfTokens("{\\b1 bold\\b0\r\n \\'e9\\{\\u-10179?\\bin2 xy z}")]).toEqual([
      { kind: 'open' },
      { kind: 'word', name: 'b', param: 1 },
      { kind: 'text', text: 'bold' },
      { kind: 'word', name: 'b', param: 0 },
      { kind: 'text', text: ' ' },
      { kind: 'hex', byte: 0xe9 },
      { kind: 'symbol', char: '{' },
      { kind: 'word', name: 'u', param: -10179 },
      { kind: 'text', text: '?' },
      { kind: 'bytes', bytes: new Uint8Array([0x78, 0x79]) },
      { kind: 'text', text: ' z' },
      { kind: 'close' },
    ]);
  });
});

describe('readTextDocumentImport as Rich Text', () => {
  it('refuses a file that is not Rich Text', async () => {
    expect(await readTextDocumentImport(new TextEncoder().encode('hello'), 'rtf')).toMatchObject({
      ok: false,
      rejection: 'package_wrong_type',
    });
  });

  it('reads paragraphs, runs, escapes and the code page', async () => {
    const { document } = await read(
      rtf(
        "\\pard\\plain\\qc\\li720\\sa120\\sl276\\slmult1 {\\b Bold} {\\i\\ul it}{\\f1\\fs28\\cf1\\highlight2 big}\\tab caf\\'e9 \\u8364? \\emdash\\line x\\par\\pard\\plain\\s1 Head\\par",
      ),
    );
    const [p, head] = document.body as Paragraph[];
    expect(p!.props).toEqual({
      align: 'center',
      indentStart: 36,
      spaceAfter: 6,
      lineHeight: { rule: 'multiple', value: 1.15 },
    });
    expect(runs(p!.inlines)).toEqual([
      ['Bold', { bold: true }],
      [' ', {}],
      ['it', { italic: true, underline: true }],
      ['big', { font: 'Georgia', size: 14, color: '#ff0000', highlight: '#eeeeee' }],
      ['\tcafé € —\nx', {}],
    ]);
    expect(head!.style).toBe(Styles.idOfRole(document.styles, 'heading1'));
  });

  it('reads lists from the list table, numbered in their format from their start', async () => {
    const { document } = await read(
      rtf(
        '{\\*\\listtable{\\list{\\listlevel\\levelnfc4\\levelstartat3}{\\listlevel\\levelnfc23}\\listid7}}{\\*\\listoverridetable{\\listoverride\\listid7\\ls1}}' +
          '\\pard\\ls1\\ilvl0{\\listtext c.\\tab}one\\par\\pard\\ilvl1\\ls1 deep\\par\\pard plain\\par',
      ),
    );
    expect((document.body as Paragraph[]).map((p) => [Paragraph.text(p), p.list])).toEqual([
      ['one', { id: 'L1', level: 0 }],
      ['deep', { id: 'L1', level: 1 }],
      ['plain', undefined],
    ]);
    const [first, second] = document.lists.L1!.levels;
    expect(first).toMatchObject({ kind: 'number', format: 'lower-letter', start: 3 });
    expect(second!.kind).toBe('bullet');
  });

  it('reads a table with its widths, header row, merges and backgrounds', async () => {
    const IN = '\\pard\\plain\\intbl ';
    const { document } = await read(
      rtf(
        `\\trowd\\trhdr\\clmgf\\cellx1440\\clmrg\\cellx2880\n${IN}H\\cell${IN}\\cell\\row` +
          `\\trowd\\clvmgf\\clcbpat2\\cellx1440\\cellx2880\n${IN}a\\cell${IN}b\\cell\\row` +
          `\\trowd\\clvmrg\\cellx1440\\cellx2880\n${IN}\\cell${IN}c\\cell\\row\\pard after\\par`,
      ),
    );
    const [table, after] = document.body;
    if (table?.type !== 'table') throw new Error('no table');
    expect(table.columns).toEqual([72, 72]);
    expect(table.headerRows).toBe(1);
    expect(
      table.rows.map((r) =>
        r.cells.map((c) => [texts(c.blocks).join('|'), c.colSpan, c.rowSpan, c.props]),
      ),
    ).toEqual([
      [['H', 2, undefined, {}]],
      [
        ['a', undefined, 2, { background: '#eeeeee' }],
        ['b', undefined, undefined, {}],
      ],
      [['c', undefined, undefined, {}]],
    ]);
    expect(texts([after!])).toEqual(['after']);
  });

  it('reads links, bookmarks, page numbers and footnotes; an unsafe link keeps its text', async () => {
    const { document, report } = await read(
      rtf(
        '{\\*\\bkmkstart top}{\\*\\bkmkend top}{\\field{\\*\\fldinst{HYPERLINK "https://docs.nu/?q=\\\\"x\\\\""}}{\\fldrslt site}} ' +
          '{\\field{\\*\\fldinst HYPERLINK \\\\l "top"}{\\fldrslt up}} {\\field{\\*\\fldinst HYPERLINK "javascript:x"}{\\fldrslt bad}} ' +
          '{\\field{\\*\\fldinst PAGE}{\\fldrslt 4}} Claim{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn} Source.}\\par',
      ),
    );
    const [p] = document.body as Paragraph[];
    expect(
      p!.inlines.map((i) =>
        i.type === 'run'
          ? [i.text, i.link]
          : i.type === 'note'
            ? ['note', texts(i.blocks)]
            : i.type === 'field'
              ? ['field', i.field, i.text]
              : i.type === 'bookmark'
                ? ['bookmark', i.name]
                : [i.type],
      ),
    ).toEqual([
      ['bookmark', 'top'],
      ['site', 'https://docs.nu/?q="x"'],
      [' ', undefined],
      ['up', '#top'],
      [' bad ', undefined],
      ['field', 'page-number', '4'],
      [' Claim', undefined],
      ['note', [' Source.']],
    ]);
    expect(report.dropped).toEqual([{ reason: 'link', name: 'unsafe link', count: 1 }]);
  });

  it('reads a PNG at its size and crop; a metafile, a header and an object are reported', async () => {
    const hex = [...GREEN_PNG].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { document, report } = await read(
      rtf(
        `{\\header\\pard Head\\par}{\\pict\\pngblip\\picwgoal2400\\pichgoal1200\\piccropl1200\n${hex}}` +
          '{\\pict\\wmetafile8 0000}{\\object\\objemb{\\*\\objdata 00}{\\result shown}}\\par',
      ),
    );
    const [picture] = Pictures.ofDocument(document);
    expect(picture).toMatchObject({ width: 60, height: 60, crop: { left: 0.5 } });
    expect(Pictures.heldBytes(document, picture!.media)?.bytes).toEqual(GREEN_PNG);
    expect(texts(document.body)).toEqual(['shown']);
    expect(report.dropped).toEqual([
      { reason: 'header-footer', name: 'header', count: 1 },
      { reason: 'picture-format', name: 'metafile picture', count: 1 },
      { reason: 'ole-object', name: 'embedded object', count: 1 },
    ]);
  });

  it('refuses a file nested past the limit as damaged', async () => {
    expect(
      await readTextDocumentImport(new TextEncoder().encode(`{\\rtf1${'{'.repeat(500)}`), 'rtf'),
    ).toMatchObject({ rejection: 'package_damaged' });
  });
});

// LiveDoc's own Rich Text read back: every construct's paragraphs keep their words, in order (list markers, tab names
// and equations' text may come in as text).
const words = (text: string) => text.match(/\p{L}+/gu) ?? [];
const inOrder = (part: readonly string[], whole: readonly string[]) => {
  let at = 0;
  for (const word of part) {
    while (at < whole.length && whole[at] !== word) at += 1;
    if (at === whole.length) return false;
    at += 1;
  }
  return true;
};
const body = (d: TextDocument) =>
  DocumentTabs.all(d).flatMap((tab) =>
    words(Blocks.paragraphs(tab.body).map(Paragraph.text).join(' ')),
  );

describe('a Rich Text file LiveDoc wrote, imported again', () => {
  it.each(Object.keys(CONSTRUCTS))('keeps the words of %s', async (name) => {
    const original = CONSTRUCTS[name]!('odf');
    const { document } = await read(writeRtf(original));
    expect(inOrder(body(original), body(document))).toBe(true);
  });
});
