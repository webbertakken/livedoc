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
import { WRITTEN_CONSTRUCTS } from './written-constructs';

const OUT = mkdtempSync(join(tmpdir(), 'livedoc-sheets-written-'));
// LibreOffice's extensions, kept from its files: extended conformance leaves them out of the check.
const ODF_FOREIGN = new Set([
  'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
  'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
]);
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
      await validateOdfPackage(writeOds(file, name).data, join(OUT, `${name}-ods`));
      validateFlatOdf(writeFlatOds(file, name).data, join(OUT, `${name}-fods`));
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
