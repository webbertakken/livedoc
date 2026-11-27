// docs/specs/029-sheets/standard-mapping.md "Tables in the file" (D481): a table's own filter in LiveDoc's tables
// record (each filtered column's condition by its letter), the record's fingerprint lines, and the record weighed
// against the standard form, which alone says whether the filter is on.
import { describe, expect, it } from 'vitest';
import {
  readRecordedTableFilter,
  recordedTableFilter,
  tableFilterLines,
  tableFiltersFromFile,
  tableFilterWithRecord,
} from './file-table-filters';
import { readTableRecord, tableFingerprint, tableRecordText, tablesFound } from './file-tables';
import { xlsxHeld as held } from './xlsx-filters';
import { book } from '../testing/book';
import type { FileLoss } from './workbook-file';

const range = { r1: 0, c1: 1, r2: 3, c2: 2 };
const table = {
  name: 'T',
  range,
  columns: ['Item', 'N'],
  filter: [
    { c: 2, cond: { values: ['1'] }, std: { values: ['1'] } },
    { c: 1, cond: { colour: { key: 'bg' as const, is: '#ff0000' } } },
  ],
};

describe('a table’s filter in LiveDoc’s record', () => {
  it('records each condition by its column letter, and reads it back', () => {
    expect(recordedTableFilter(table)).toEqual({
      C: { values: ['1'] },
      B: { colour: { key: 'bg', is: '#ff0000' } },
    });
    expect(recordedTableFilter({ ...table, filter: [] })).toEqual({});
    expect(recordedTableFilter({})).toBeUndefined();
    const text = tableRecordText([table]);
    expect(readTableRecord(text)?.tables[0]?.filter).toEqual(recordedTableFilter(table));
  });

  it('refuses a recorded filter that is not one', () => {
    expect(readRecordedTableFilter(undefined, range)).toBeUndefined();
    for (const bad of [[], 'x', null, { B: { op: 'nope' } }, { E: { values: ['1'] } }])
      expect(readRecordedTableFilter(bad, range), JSON.stringify(bad)).toBeNull();
    expect(
      readTableRecord('{"tables":[{"name":"T","range":"B1:C4","filter":{"Z":{"op":"empty"}}}]}'),
    ).toBeNull();
  });

  it('fingerprints each column the format holds, so another app’s change is seen', () => {
    expect(tableFilterLines(table, held)).toEqual(['2 {"values":["1"]}']);
    expect(tableFilterLines({}, held)).toEqual([]);
    const changed = { ...table, filter: [{ c: 2, std: { values: ['2'] } }] };
    expect(tableFingerprint([changed], held)).not.toBe(tableFingerprint([table], held));
    // A filter on with no column filtered fingerprints as one off: the standard form says which.
    const { filter: _f, ...off } = table;
    expect(tableFingerprint([{ ...table, filter: [] }], held)).toBe(tableFingerprint([off], held));
  });

  it('gives a filter the standard form shows on the record’s conditions, and none to one it shows off', () => {
    const record = { text: tableRecordText([table]), fingerprint: tableFingerprint([table], held) };
    const standard = { ...table, filter: [{ c: 2, std: { values: ['1'] } }] };
    expect(tablesFound({ standard: [standard], record, held }).tables[0]?.filter).toEqual(
      table.filter.map((x) => ({ ...x })).sort((a, b) => b.c - a.c),
    );
    expect(tableFilterWithRecord({}, { B: { op: 'empty' } })).toBeUndefined();
    expect(tableFilterWithRecord(standard, undefined)).toBe(standard.filter);
  });
});

describe('a file’s table filters on a sheet', () => {
  it('reads each made table’s conditions by name, and leaves the rest', () => {
    const b = book({ B1: 'Item', C1: 'N', B2: 'a', C2: '1' });
    const sheet = b.sheets[0]!;
    const losses: FileLoss[] = [];
    const making = { sheet: 'S', rand: Math.random, losses, ctx: b.wb.ctxFor(sheet.id) };
    const layout = {
      ...sheet.layout,
      tables: [
        { id: 'tbl001', name: 'T', r1: 's0r0', c1: 's0c1', r2: 's0r3', c2: 's0c2', filter: {} },
        { id: 'tbl002', name: 'U', r1: 's0r5', c1: 's0c1', r2: 's0r7', c2: 's0c2' },
      ],
    };
    const file = [table, { name: 'U', filter: [{ c: 1, std: { values: ['x'] } }] }];
    const made = tableFiltersFromFile(file, layout, making);
    expect(made?.[0]?.filter).toEqual({
      s0c2: { values: ['1'] },
      s0c1: { colour: { key: 'bg', is: '#ff0000' } },
    });
    // Off on the sheet: left off.
    expect(made?.[1]).toBe(layout.tables[1]);
    expect(tableFiltersFromFile(file, sheet.layout, making)).toBeUndefined();
    expect(losses).toEqual([]);
  });
});
