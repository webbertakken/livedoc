// docs/specs/029-sheets/inserted-objects.md "Smart chips" (C3): smart chips are left out, and a chip in an arriving
// file is kept and shown as its text, and written back as it came. Google Sheets exports a person chip as its email
// linked to `mailto:`, and a file chip as its title linked to the file (corpus/google/smart-chips, made by
// CORPUS_SOURCE=google-chips).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { AGENT_LOCALE } from '../a1-io';
import { sheetFromJson } from '../sheet-json';
import { WorkbookRecord } from '../workbook-record';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { isMarkedParagraph, keptParagraphsText } from './ods-cell-text';
import { parseXml } from '@livedoc/office-packages';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus', 'google');
const PERSON = 'ada@example.com';
const FILE = 'See LiveDoc corpus smart-chips';
const BY = { id: 'corpus', name: 'Corpus', color: '#000000' };

async function texts(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const listed = listZip(bytes);
  if (!listed.ok) throw new Error('zip');
  let all = '';
  for (const entry of listed.entries) {
    const read = await readZipEntry(bytes, entry, new ByteBudget(50_000_000));
    if (read.ok) all += new TextDecoder().decode(read.bytes);
  }
  return all;
}

describe('a smart chip in an arriving file', () => {
  it.each(['xlsx', 'ods'] as const)('is kept as its text and its link in .%s', async (ext) => {
    const bytes = new Uint8Array(readFileSync(join(CORPUS, `smart-chips.${ext}`)));
    const read = await readWorkbookFile(bytes, AGENT_LOCALE);
    if (!read.ok) throw new Error(read.rejection);
    let n = 3;
    const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
    const made = sheetsFromFile(read.file, AGENT_LOCALE, rand);
    const chips = made.sheets.find((s) => s.title === 'Chips')!;
    const input = (r: number, c: number) =>
      chips.cells.find((cell) => cell.r === chips.layout.rows[r] && cell.c === chips.layout.cols[c])
        ?.i;
    // Shown as its text.
    expect(input(1, 0)).toEqual({ s: PERSON });
    expect(input(1, 1)).toEqual({ s: FILE });
    // Written back as it came: the text and its link.
    const sheets = made.sheets.map((m, i) =>
      sheetFromJson({ ...m, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
    );
    const record = WorkbookRecord.opened(
      WorkbookRecord.create({ locale: AGENT_LOCALE, timeZone: 'UTC' }),
      read.format,
      read.file.theme,
    );
    const out = await texts(writeWorkbook(sheets, record, 'Chips', read.format, made.kept).data);
    expect(out).toContain(PERSON);
    expect(out).toContain(FILE);
    expect(out).toContain(`mailto:${PERSON}`);
  });
});

describe('marked cell text in ODF (standard-mapping.md "Unknown content", D376)', () => {
  it('writes plain paragraphs once the cell is edited, the link going with its old text', async () => {
    const bytes = new Uint8Array(readFileSync(join(CORPUS, 'smart-chips.ods')));
    const read = await readWorkbookFile(bytes, AGENT_LOCALE);
    if (!read.ok) throw new Error(read.rejection);
    let n = 3;
    const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
    const made = sheetsFromFile(read.file, AGENT_LOCALE, rand);
    const sheets = made.sheets.map((m, i) =>
      sheetFromJson({
        ...m,
        cells: m.cells.map((c) =>
          c.i && 's' in c.i && c.i.s === PERSON ? { ...c, i: { s: 'Ada' } } : c,
        ),
        tabId: `tab${i}`,
        rev: 0,
        createdAt: i,
        updatedAt: i,
        updatedBy: BY,
      }),
    );
    const record = WorkbookRecord.opened(
      WorkbookRecord.create({ locale: AGENT_LOCALE, timeZone: 'UTC' }),
      read.format,
      read.file.theme,
    );
    const out = await texts(writeWorkbook(sheets, record, 'Chips', read.format, made.kept).data);
    expect(out).toContain('>Ada<');
    expect(out).not.toContain(`mailto:${PERSON}`);
    // The file chip, unchanged, keeps its link.
    expect(out).toContain('docs.google.com');
  });
});

describe('ods-cell-text', () => {
  it('tells marked paragraphs from plain ones, and reads kept ones back', () => {
    const ns = { text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0' };
    const parse = (xml: string) => {
      const p = parseXml(`<text:p xmlns:text="${ns.text}">${xml}</text:p>`);
      if (!p.ok) throw new Error('xml');
      return p.root;
    };
    expect(isMarkedParagraph(parse('a<text:s text:c="2"/>b<text:tab/>'))).toBe(false);
    expect(isMarkedParagraph(parse('<text:span>a</text:span>'))).toBe(true);
    expect(
      keptParagraphsText([
        { xml: '<text:p>a<text:s/>b</text:p>', ns },
        { xml: '<text:p>c</text:p>', ns },
      ]),
    ).toBe('a b\nc');
    expect(keptParagraphsText([{ xml: '<text:p>', ns }])).toBeNull();
  });
});
