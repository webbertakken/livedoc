// IMPORTRANGE's address and range string (docs/specs/029-sheets/formulas.md "Other workbooks", D75): a LiveDoc
// document address or its id names the source; a range string names cells or a name, nothing else.
import { describe, expect, it } from 'vitest';
import { importParams, readImportParams, type ImportRequest } from './import-request';
import { rangeSource, rangeStringOk, RANGE_SOURCE_ID_MAX, RANGE_STRING_MAX } from './range-import';

describe('rangeSource', () => {
  it.each([
    ['https://docs.nu/document/abc123', 'abc123'],
    ['http://localhost:3000/document/abc_1-2?tab=x#y', 'abc_1-2'],
    ['https://docs.nu/document/abc/edit', 'abc'],
    ['  abc123  ', 'abc123'],
    ['https://docs.google.com/spreadsheets/d/abcd123', null],
    ['https://docs.nu/documents/abc', null],
    ['https://docs.nu/document/', null],
    ['https://docs.nu/document', null],
    ['https://docs.nu/document/a%20b', null],
    ['ftp://docs.nu/document/abc', null],
    ['', null],
    ['not an address', null],
    ['x'.repeat(RANGE_SOURCE_ID_MAX + 1), null],
  ])('reads %j as %j', (text, id) => {
    expect(rangeSource(text)).toBe(id);
  });
});

describe('rangeStringOk', () => {
  it.each([
    ['Sheet1!A2:B6', true],
    ["'Q3 Costs'!A:C", true],
    ['A2:B6', true],
    [' A2 ', true],
    ['A2:A', true],
    ['Sales_total', true],
    ['A1:B2:C3', true],
    ['A1 B2', false],
    ['A1+1', false],
    ['SUM(A1)', false],
    ['=A1', false],
    ['', false],
    ['A1:', false],
    [`${'x'.repeat(RANGE_STRING_MAX)}!A1`, false],
  ])('%j is %j', (text, ok) => {
    expect(rangeStringOk(text)).toBe(ok);
  });
});

describe('a range import on the wire', () => {
  const r: ImportRequest = { kind: 'range', source: 'abc', range: 'Data!A1:B2' };

  it('carries the source and the range there and back', () => {
    expect(readImportParams(new URLSearchParams(importParams(r, true).toString()))).toEqual(r);
    expect(importParams(r).has('url')).toBe(false);
  });

  it.each([
    'kind=range&source=&range=A1',
    'kind=range&source=abc&range=A1%2B1',
    'kind=range&range=A1',
    'kind=range&source=abc',
  ])('refuses %s', (q) => {
    expect(readImportParams(new URLSearchParams(q))).toBeNull();
  });
});
