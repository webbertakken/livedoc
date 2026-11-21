// An import's request on every side (docs/specs/029-sheets/imports.md): its address (D61), its key, the query string
// the page sends and the api reads back, a feed's query, and the bounds of an answer.
import { describe, expect, it } from 'vitest';
import {
  boundedRows,
  feedQuery,
  importKey,
  importParams,
  importUrl,
  readImportParams,
  IMPORT_WORDS,
  type ImportRequest,
} from './import-request';
import { parseMarkup, shownTextOf } from './markup';

describe('importUrl', () => {
  it.each([
    ['https://example.com/a b', 'https://example.com/a%20b'],
    [' HTTP://Example.com ', 'http://example.com/'],
    ['example.com/x', 'http://example.com/x'],
    ['example.com:8080/x', 'http://example.com:8080/x'],
    ['ftp://example.com', null],
    ['mailto:a@b.c', null],
    ['javascript:alert(1)', null],
    ['', null],
    ['http://', null],
    ['http://[::1', null],
  ])('reads %j as %j', (text, url) => {
    expect(importUrl(text)).toBe(url);
  });
});

describe('feedQuery', () => {
  it.each([
    ['items', 'items'],
    [' Items  Title ', 'items title'],
    ['items created', 'items created'],
    ['items author', null],
    ['feed', 'feed'],
    ['feed description', 'feed description'],
    ['feed summary', null],
    ['entries', null],
    ['items title more', null],
  ])('reads %j as %j', (text, query) => {
    expect(feedQuery(text)).toBe(query);
  });
});

describe('the wire', () => {
  const REQUESTS: ImportRequest[] = [
    { kind: 'data', url: 'https://example.com/a.csv' },
    { kind: 'html', url: 'https://example.com/', query: 'list', index: 3 },
    { kind: 'xml', url: 'https://example.com/', xpath: '//a[@x="1&2"]' },
    { kind: 'feed', url: 'https://example.com/f', query: 'items url', headers: true, items: 5 },
    { kind: 'feed', url: 'https://example.com/f', query: 'feed', headers: false, items: null },
  ];

  it.each(REQUESTS)('carries %j there and back', (r) => {
    expect(readImportParams(new URLSearchParams(importParams(r).toString()))).toEqual(r);
  });

  it('marks a fresh ask', () => {
    expect(importParams(REQUESTS[0]!, true).get('fresh')).toBe('1');
    expect(importParams(REQUESTS[0]!).has('fresh')).toBe(false);
  });

  it.each([
    'kind=data',
    'kind=data&url=ftp://x',
    'kind=zip&url=https://x',
    'kind=xml&url=https://x',
    'kind=html&url=https://x&query=div&index=1',
    'kind=html&url=https://x&query=table&index=0',
    'kind=html&url=https://x&query=table',
    'kind=feed&url=https://x&query=nope&headers=0',
    'kind=feed&url=https://x&query=items&headers=yes',
    'kind=feed&url=https://x&query=items&headers=0&items=-1',
    'kind=feed&url=https://x&headers=1',
  ])('refuses %s', (q) => {
    expect(readImportParams(new URLSearchParams(q))).toBeNull();
  });

  it('keys the same arguments alike, whatever their order', () => {
    expect(importKey({ kind: 'html', url: 'u', query: 'table', index: 1 })).toBe(
      importKey({ index: 1, query: 'table', url: 'u', kind: 'html' }),
    );
    expect(importKey(REQUESTS[0]!)).not.toBe(importKey({ ...REQUESTS[0]!, url: 'https://x.org/' }));
  });
});

describe('boundedRows', () => {
  it('is empty for no rows or no columns', () => {
    const empty = { error: '#N/A', why: IMPORT_WORDS.empty };
    expect(boundedRows([])).toEqual(empty);
    expect(boundedRows([[], []])).toEqual(empty);
  });

  it('refuses more rows than the bound before measuring them', () => {
    expect(boundedRows(Array.from({ length: 100_001 }, () => ['x']))).toEqual({
      error: '#N/A',
      why: IMPORT_WORDS.tooLarge,
    });
  });
});

describe('shownTextOf', () => {
  it('keeps blocks apart and inline text together', () => {
    const root = parseMarkup('<div>a<b>b</b><p>c</p>d<br>e</div>', 'html');
    expect(shownTextOf(root)).toBe('ab c d e');
    expect(shownTextOf(root.children[0]!)).toBe('ab c d e');
  });
});
