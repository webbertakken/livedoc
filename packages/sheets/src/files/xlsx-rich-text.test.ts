// docs/specs/029-sheets/standard-mapping.md "Unknown content", Cell text (XLSX, D377): a cell's rich text (a string of
// runs, each with its own font) reads as its plain text, and its runs are written back while the text reads the same.
import { describe, expect, it } from 'vitest';
import { readOoxmlPackage } from '@livedoc/office-packages';
import { xlsx } from '../testing/hand-files';
import type { FileValue, WorkbookFile } from './workbook-file';
import { keptRunsText } from './xlsx-cell-text';
import { SPREADSHEETML_NS } from './xlsx-parts';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

const RICH =
  '<r><rPr><b/><color rgb="FFFF0000"/></rPr><t xml:space="preserve">Red </t></r><r><t>text</t></r>';
const strings = (...items: string[]) =>
  `<sst xmlns="${SPREADSHEETML_NS}">${items.map((i) => `<si>${i}</si>`).join('')}</sst>`;
const PLAIN = '<t>plain</t>';

async function read(bytes: Uint8Array<ArrayBuffer>): Promise<WorkbookFile> {
  const file = await readXlsx(bytes);
  if (!file.ok) throw new Error(file.rejection);
  return file.file;
}

async function sharedStringsOf(file: WorkbookFile): Promise<string> {
  const written = await readOoxmlPackage(writeXlsx(file, 'Rich').data);
  if (!written.ok) throw new Error(written.rejection);
  return new TextDecoder().decode(written.package.parts.get('xl/sharedStrings.xml'));
}

const value = (file: WorkbookFile, r: number, c: number): FileValue | undefined =>
  file.sheets[0]!.cells.find((cell) => cell.r === r && cell.c === c)?.value;

function edited(file: WorkbookFile, r: number, c: number, text: string): WorkbookFile {
  const [sheet, ...rest] = file.sheets;
  const cells = sheet!.cells.map((cell) =>
    cell.r === r && cell.c === c ? { ...cell, value: { k: 's' as const, v: text } } : cell,
  );
  return { ...file, sheets: [{ ...sheet!, cells }, ...rest] };
}

describe('rich text in an arriving .xlsx', () => {
  it('reads as its plain text and writes its runs back while the text reads the same', async () => {
    const file = await read(
      xlsx(['<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'], {
        strings: strings(RICH, PLAIN),
      }),
    );
    expect(value(file, 0, 0)).toEqual({ k: 's', v: 'Red text' });
    expect(value(file, 0, 1)).toEqual({ k: 's', v: 'plain' });
    expect(file.kept?.items.filter((i) => i.place === 'cell-text')).toHaveLength(2);
    const out = await sharedStringsOf(file);
    expect(out).toContain(`<si>${RICH}</si>`);
    expect(out).toContain('<si><t>plain</t></si>');
    // Read again, it is the same text and the same runs.
    const again = await read(
      xlsx(['<row r="1"><c r="A1" t="s"><v>0</v></c></row>'], { strings: out }),
    );
    expect(value(again, 0, 0)).toEqual({ k: 's', v: 'Red text' });
  });

  it('writes an edited cell plain, and two cells of the same runs share one string', async () => {
    const file = await read(
      xlsx(
        [
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>0</v></c></row>',
        ],
        { strings: strings(RICH) },
      ),
    );
    const out = await sharedStringsOf(edited(file, 0, 2, 'Blue text'));
    expect(out.split(RICH)).toHaveLength(2);
    expect(out).toContain('<si><t>Blue text</t></si>');
    expect(out).toContain('count="3" uniqueCount="2"');
  });

  it('keeps an inline string of runs, its phonetic guide not its text', async () => {
    const runs =
      '<r><rPr><i/></rPr><t>漢字</t></r><rPh sb="0" eb="2"><t>かんじ</t></rPh><x:t xmlns:x="urn:other">?</x:t>';
    const file = await read(
      xlsx([`<row r="1"><c r="A1" t="inlineStr"><is>${runs}</is></c></row>`]),
    );
    expect(value(file, 0, 0)).toEqual({ k: 's', v: '漢字' });
    expect(await sharedStringsOf(file)).toContain(`<si>${runs}</si>`);
  });

  it('names a Strict file’s runs with its unread content, and keeps nothing', async () => {
    const strict = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
    const workbook = `<workbook xmlns="${strict}" xmlns:r="http://purl.oclc.org/ooxml/officeDocument/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const sheet = (xml: string) => xml.replace(SPREADSHEETML_NS, strict);
    const bytes = xlsx(['<row r="1"><c r="A1" t="s"><v>0</v></c></row>'], {
      workbook,
      ns: strict,
      strings: sheet(strings(RICH)),
    });
    const read = await readXlsx(bytes);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.cells[0]!.value).toEqual({ k: 's', v: 'Red text' });
    expect(read.losses).toContainEqual({ k: 'kept_unread', count: 1 });
  });
});

describe('keptRunsText', () => {
  it('reads kept runs as the cell’s text, a phonetic guide aside, and null when one does not parse', () => {
    const ns = { '': SPREADSHEETML_NS };
    expect(
      keptRunsText([
        { xml: '<r><rPr><b/></rPr><t>a_x000D_</t></r>', ns },
        { xml: '<t>b</t>', ns },
        { xml: '<rPh><t>c</t></rPh>', ns },
        { xml: '<r/>', ns },
      ]),
    ).toBe('a\rb');
    expect(keptRunsText([{ xml: '<r>', ns }])).toBeNull();
  });
});
