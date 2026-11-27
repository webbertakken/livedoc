// Every spreadsheet file LiveDoc writes, validated against its own format's schema (docs/specs/029-sheets/
// standard-mapping.md "Conformance claimed"; office-packages.md "Validation"): one workbook per construct group of the
// mapping, written as `.ods`, `.fods` and `.xlsx`, each XML entry checked by Jing; then LibreOffice opens each and
// saves it again, and its file reads back with the same sheets and values. Run by
// `pnpm --filter @livedoc/sheets validate:files`, in CI's Office files job. Needs Java and LibreOffice (`soffice`).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import {
  fetchOfficeSchemas,
  validateFlatOdf,
  validateOdfPackage,
  validateOoxmlPackage,
} from '@livedoc/office-packages/validation';
import {
  blockCachePositions,
  readWorkbookFile,
  writeFlatOds,
  writeOds,
  writeXlsx,
  XLSX_TEXT_MAX,
  type FileCell,
  type WorkbookFile,
} from '../files';
import { FILE_LAST_COL } from '../files/a1-text';
import { excelFileWithKept, odfFlatWithKept } from '../testing/kept-files';
import { readOds } from '../files/ods-read';
import { readXlsx } from '../files/xlsx-read';
import { LIVEDOC_SPREADSHEET_NS } from '../files/validation-standard';
import { VALIDATIONS, WRITTEN_CONSTRUCTS } from './written-constructs';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { PIVOT_CASES } from '../../corpus/pivot-cases';
import { casesInTheGrid } from '../testing/pivot-cases-book';
import { sheetsFromFile, workbookFileOf } from '../files/workbook-file';
import { sheetFromJson } from '../sheet-json';
import { Workbook } from '../engine/workbook';
import { pivotSimplified } from '../files/file-pivots';

const OUT = mkdtempSync(join(tmpdir(), 'livedoc-sheets-written-'));
// LibreOffice's extensions, kept from its files: extended conformance leaves them out of the check.
const ODF_FOREIGN = new Set([
  'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
  'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
]);
// LiveDoc's own validation rules beside the standard ones (standard-mapping.md "Validation in the file"): extended.
const ODF_OWN = new Set([LIVEDOC_SPREADSHEET_NS]);
fetchOfficeSchemas();

// Within every format's bounds (standard-mapping.md "Excel's grammar in detail"): what both files carry as it is.
const withinBounds = (cell: FileCell) =>
  cell.c < FILE_LAST_COL && !(cell.value?.k === 's' && cell.value.v.length > XLSX_TEXT_MAX);

// What another suite must read back: each sheet's literal cells' values (formulas, and the blocks they fill, it
// calculates itself).
function literals(file: WorkbookFile) {
  return file.sheets.map((sheet) => {
    const blocks = blockCachePositions(sheet.cells);
    const literal = (cell: FileCell) =>
      cell.formula === undefined && !blocks.has(`${cell.r},${cell.c}`) && withinBounds(cell);
    return {
      cells: sheet.cells
        .filter((cell) => cell.value && literal(cell))
        .map((cell) => ({ r: cell.r, c: cell.c, value: cell.value })),
    };
  });
}

function literalsIn(read: WorkbookFile, wrote: WorkbookFile) {
  return literals(wrote).map((sheet, i) => ({
    cells: sheet.cells.map((cell) => ({
      ...cell,
      value: read.sheets[i]?.cells.find((c) => c.r === cell.r && c.c === cell.c)?.value,
    })),
  }));
}

// standard-mapping.md "Unknown content", "Conformance claimed": a file written with what it kept still conforms; the
// kept parts themselves are the file's own, written back as they came.
describe('a written spreadsheet with kept content validates against its format’s schema', () => {
  it('kept.ods and kept.fods against ODF 1.4, extended', async () => {
    const read = await readOds(new TextEncoder().encode(odfFlatWithKept()));
    if (!read.ok) throw new Error(read.rejection);
    await validateOdfPackage(writeOds(read.file, 'kept').data, join(OUT, 'kept-ods'), ODF_FOREIGN);
    validateFlatOdf(writeFlatOds(read.file, 'kept').data, join(OUT, 'kept-fods'), ODF_FOREIGN);
  });

  it('kept.xlsx against ISO/IEC 29500 Transitional', async () => {
    const read = await readXlsx(excelFileWithKept());
    if (!read.ok) throw new Error(read.rejection);
    const kept = new Set(read.file.kept?.parts.map((p) => p.name));
    await validateOoxmlPackage(writeXlsx(read.file, 'kept').data, join(OUT, 'kept-xlsx'), (part) =>
      kept.has(part),
    );
  });
});

describe('every written spreadsheet validates against its format’s schema', () => {
  for (const [name, file] of Object.entries(WRITTEN_CONSTRUCTS)) {
    it(`${name}.ods and ${name}.fods against ODF 1.4`, async () => {
      await validateOdfPackage(writeOds(file, name).data, join(OUT, `${name}-ods`), ODF_OWN);
      validateFlatOdf(writeFlatOds(file, name).data, join(OUT, `${name}-fods`), ODF_OWN);
    });

    it(`${name}.xlsx against ISO/IEC 29500 Transitional`, async () => {
      await validateOoxmlPackage(writeXlsx(file, name).data, join(OUT, `${name}-xlsx`));
    });

    // standard-mapping.md "Conformance claimed": another suite opens what LiveDoc writes with the same values.
    it(`${name} opens in LibreOffice, which saves it again with the same sheets and values`, async () => {
      for (const [type, target] of [
        ['fods', 'ods'],
        ['xlsx', 'xlsx:Calc MS Excel 2007 XML'],
      ] as const) {
        const path = join(OUT, `${name}.${type}`);
        const written =
          type === 'fods' ? writeFlatOds(file, name).data : writeXlsx(file, name).data;
        writeFileSync(path, written);
        const saved = libreOfficeConvert(path, target);
        const read = await readWorkbookFile(new Uint8Array(saved));
        if (!read.ok) throw new Error(`${type}: ${read.rejection}`);
        expect(literalsIn(read.file, file), type).toEqual(literals(file));
      }
    }, 120_000);
  }
});

// standard-mapping.md "Protection in the file": LibreOffice guards the sheet LiveDoc protects, and saves it again
// protected with the cells it leaves open, in both formats. LibreOffice copies no XML through a save: it writes the
// sheet's protection and every cell style again from its own model. So a re-saved sheet still protected, its exception
// cells still open and every other cell still locked, shows its model holds them so, and that model is what its
// editing check reads: an edit in an exception passes, one elsewhere is refused.
describe('protection other apps enforce', () => {
  it('LibreOffice keeps the protected sheet of the .fods and .xlsx it opens and saves', async () => {
    const file = WRITTEN_CONSTRUCTS.protection!;
    for (const [type, target] of [
      ['fods', 'ods'],
      ['xlsx', 'xlsx:Calc MS Excel 2007 XML'],
    ] as const) {
      const path = join(OUT, `protection-other.${type}`);
      writeFileSync(
        path,
        type === 'fods' ? writeFlatOds(file, 'p').data : writeXlsx(file, 'p').data,
      );
      const read = await readWorkbookFile(new Uint8Array(libreOfficeConvert(path, target)));
      if (!read.ok) throw new Error(`${type}: ${read.rejection}`);
      const [locked, open] = read.file.sheets;
      expect(locked!.protections?.[0], type).toMatchObject({ can: 'owner' });
      // The exception's cells stay open: Excel's protected range, LibreOffice's unprotected cell style.
      const except = locked!.protections?.[0]?.except ?? [];
      expect(except, type).toContainEqual({ r1: 1, c1: 0, r2: 2, c2: 0 });
      // Every cell outside it comes back locked: A1 above it, B2 beside it, A4 below it.
      const openAt = (r: number, c: number) =>
        except.some((g) => g.r1 <= r && r <= g.r2 && g.c1 <= c && c <= g.c2);
      for (const [r, c] of [
        [0, 0],
        [1, 1],
        [3, 0],
      ] as const)
        expect(openAt(r, c), `${type} ${r},${c}`).toBe(false);
      expect(open!.protections, type).toBeUndefined();
    }
  }, 120_000);
});

// standard-mapping.md "Tables in the file": LibreOffice reads the table LiveDoc writes, works out every formula reading
// it (the cached values are 0), and saves the table again as its own.
describe('tables other apps read', () => {
  it('LibreOffice computes the table references of the .xlsx and .fods it opens, and keeps the table', async () => {
    const file = WRITTEN_CONSTRUCTS.tables!;
    for (const [type, target] of [
      ['fods', 'ods'],
      ['xlsx', 'xlsx:Calc MS Excel 2007 XML'],
    ] as const) {
      const path = join(OUT, `tables-other.${type}`);
      writeFileSync(
        path,
        type === 'fods' ? writeFlatOds(file, 't').data : writeXlsx(file, 't').data,
      );
      const saved = libreOfficeConvert(path, target, { recalculate: true });
      const read = await readWorkbookFile(new Uint8Array(saved));
      if (!read.ok) throw new Error(`${type}: ${read.rejection}`);
      const [sheet] = read.file.sheets;
      const at = (r: number, c: number) => sheet!.cells.find((x) => x.r === r && x.c === c)?.value;
      expect([at(0, 3), at(1, 3), at(2, 3), at(3, 1), at(3, 3)], type).toEqual(
        [4, 6, 2, 4, 8].map((v) => ({ k: 'n', v })),
      );
      expect(
        sheet!.tables?.map((t) => [t.name, t.range]),
        type,
      ).toEqual([['Sales', { r1: 0, c1: 0, r2: 3, c2: 1 }]]);
    }
  }, 120_000);
});

// standard-mapping.md "Validation in the file": LibreOffice checks the standard rule LiveDoc writes beside its own, and
// saves it again as its own rule (a checkbox a TRUE, FALSE list; Text Is Exactly a custom formula).
describe('validation rules other apps check', () => {
  it('LibreOffice keeps each standard rule of the .fods and .xlsx it opens and saves', async () => {
    const file = WRITTEN_CONSTRUCTS.validation!;
    for (const [type, target] of [
      ['fods', 'ods'],
      ['xlsx', 'xlsx:Calc MS Excel 2007 XML'],
    ] as const) {
      const path = join(OUT, `validation-other.${type}`);
      writeFileSync(
        path,
        type === 'fods' ? writeFlatOds(file, 'v').data : writeXlsx(file, 'v').data,
      );
      const read = await readWorkbookFile(new Uint8Array(libreOfficeConvert(path, target)));
      if (!read.ok) throw new Error(`${type}: ${read.rejection}`);
      const rules = read.file.sheets[0]!.validations ?? [];
      const at = (r: number, c: number) =>
        rules.find((x) => x.ranges.some((g) => g.r1 <= r && r <= g.r2 && g.c1 <= c && c <= g.c2));
      expect(rules.length, type).toBeGreaterThanOrEqual(VALIDATIONS.length);
      expect(at(1, 0), type).toMatchObject({ is: 'list', opts: [{ v: 'To Do' }, { v: 'Done' }] });
      expect(at(1, 1), type).toMatchObject({ is: 'range', src: "'My Lists'!A1:A2" });
      expect(at(1, 2), type).toMatchObject({ is: 'list', opts: [{ v: 'TRUE' }, { v: 'FALSE' }] });
      expect(at(3, 2), type).toMatchObject({ is: 'list', opts: [{ v: 'Yes' }, { v: 'No' }] });
      expect(at(1, 3), type).toMatchObject({ is: 'num', op: 'between', a: 1, b: 10 });
      expect(at(2, 3), type).toMatchObject({ is: 'num', op: 'gt', a: 5, warn: true });
      expect(at(1, 4), type).toMatchObject({ is: 'date', op: 'after', a: 46296 });
      expect(at(1, 5)?.is, type).toBe('formula');
      expect(at(1, 5)?.fx, type).toMatch(/^=F2="Yes"$/i);
      expect(at(1, 6), type).toMatchObject({ is: 'formula' });
    }
  }, 120_000);
});

// standard-mapping.md "Pivot tables in the file": every evidence case's pivot table, written to each format, validates
// against its schema, and LibreOffice reads each into a pivot table of its own, working out the same grand totals.
describe('pivot tables other apps read', () => {
  const b = casesInTheGrid();
  const file = workbookFileOf(b.wb, b.sheets, 'en-US');
  const numbers = (cells: readonly FileCell[]) =>
    new Set(cells.flatMap((c) => (c.value?.k === 'n' ? [Math.round(c.value.v * 1e9) / 1e9] : [])));

  it('pivots.ods, pivots.fods and pivots.xlsx against their schemas', async () => {
    // LibreOffice's `loext:ignore-selected-page` on page fields: extended conformance.
    const foreign = new Set([...ODF_OWN, ...ODF_FOREIGN]);
    await validateOdfPackage(writeOds(file, 'pivots').data, join(OUT, 'pivots-ods'), foreign);
    validateFlatOdf(writeFlatOds(file, 'pivots').data, join(OUT, 'pivots-fods'), foreign);
    await validateOoxmlPackage(writeXlsx(file, 'pivots').data, join(OUT, 'pivots-xlsx'));
  });

  it.each([
    ['xlsx', 'ods', 'xlsx'],
    ['ods', 'xlsx:Calc MS Excel 2007 XML', 'odf'],
  ] as const)(
    'LibreOffice reads every pivot table of the .%s it opens',
    async (type, target, format) => {
      const path = join(OUT, `pivots-lo.${type}`);
      writeFileSync(path, type === 'ods' ? writeOds(file, 'p').data : writeXlsx(file, 'p').data);
      const saved = libreOfficeConvert(path, target);
      const text = type === 'xlsx' ? await odsContent(saved) : '';
      if (type === 'xlsx')
        expect(text.match(/<table:data-pilot-table /g)).toHaveLength(PIVOT_CASES.length);
      const read = await readWorkbookFile(new Uint8Array(saved));
      if (!read.ok) throw new Error(`${type}: ${read.rejection}`);
      for (const sheet of file.sheets) {
        const p = sheet.pivots?.[0];
        if (!p || pivotSimplified(p.fields, format).length > 0) continue;
        const last = sheet.cells.filter((c) => c.r === p.at.r + p.output.rows - 1);
        const theirs = numbers(read.file.sheets.find((s) => s.name === sheet.name)!.cells);
        for (const n of numbers(last)) expect(theirs.has(n), `${sheet.name} ${n}`).toBe(true);
      }
    },
    180_000,
  );
});

// The cases LibreOffice's saves say whole: its ODS leaves out sorting by a value, grouping, filters by condition or
// formula, calculated fields and Repeat Row Labels; its XLSX Show As, grand totals and sorting too.
const WHOLE_AFTER_LIBREOFFICE = {
  ods: [
    'Rows',
    'Rows and columns',
    'Two levels',
    'Percent of row',
    'Percent of column',
    'Percent of total',
    'No totals, filtered',
    'Values as rows',
    'Columns only',
    'Two values, columns',
    'Two column levels',
    'Group limit',
    'Descending labels',
  ],
  xlsx: [
    'Rows',
    'Rows and columns',
    'Two levels',
    'Values as rows',
    'Columns only',
    'Two values, columns',
    'Two column levels',
    'Group limit',
  ],
};

describe('pivot tables LibreOffice saved', () => {
  it.each(['ods', 'xlsx'] as const)(
    'reads its own .%s of ours back from the standard form, as LiveDoc works them out',
    async (type) => {
      const b = casesInTheGrid();
      const path = join(OUT, `pivots-lo-own-source.${type}`);
      writeFileSync(
        path,
        type === 'ods'
          ? writeOds(workbookFileOf(b.wb, b.sheets, 'en-US'), 'p').data
          : writeXlsx(workbookFileOf(b.wb, b.sheets, 'en-US'), 'p').data,
      );
      const saved = libreOfficeConvert(path, type);
      const read = await readWorkbookFile(new Uint8Array(saved), 'en-US');
      if (!read.ok) throw new Error(read.rejection);
      const made = sheetsFromFile(read.file, 'en-US');
      const sheets = made.sheets.map((s, i) =>
        sheetFromJson({
          ...s,
          tabId: `t${i}`,
          rev: 0,
          createdAt: i,
          updatedAt: i,
          updatedBy: { id: 'x', name: 'x', color: '#000000' },
        }),
      );
      const wb = new Workbook({
        sheets,
        locale: 'en-US',
        now: () => 46303.5,
        rand: () => 0.5,
        cards: null,
      });
      const grid = (w: Workbook, list: readonly { id: string; title: string }[], title: string) => {
        const sheet = list.find((x) => x.title === title)!;
        const { rows, cols } = w.shownExtent(sheet.id);
        return Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => w.value(sheet.id, r, c)),
        );
      };
      const equal = PIVOT_CASES.filter(
        ({ title }) =>
          JSON.stringify(grid(wb, sheets, title)) === JSON.stringify(grid(b.wb, b.sheets, title)),
      ).map((c) => c.title);
      // LibreOffice keeps no record of LiveDoc's: every pivot table is read from its standard form.
      expect([...read.losses, ...made.losses].filter((l) => l.k.startsWith('pivot'))).toEqual([]);
      expect(equal).toEqual(WHOLE_AFTER_LIBREOFFICE[type]);
    },
    180_000,
  );
});

async function odsContent(saved: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(saved);
  const listed = listZip(bytes);
  if (!listed.ok) throw new Error('zip');
  const entry = listed.entries.find((e) => e.name === 'content.xml')!;
  const read = await readZipEntry(bytes, entry, new ByteBudget(100_000_000));
  if (!read.ok) throw new Error('zip');
  return new TextDecoder().decode(read.bytes);
}
