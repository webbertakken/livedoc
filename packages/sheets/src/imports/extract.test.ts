// What the api answers for a fetched page (docs/specs/029-sheets/imports.md "The functions"): IMPORTDATA's rows,
// IMPORTHTML's tables and lists, IMPORTXML's nodes, IMPORTFEED's items, and the failures.
import { describe, expect, it } from 'vitest';
import { extractImport, isTabSeparated, isXml, tableRows, type FetchedPage } from './extract';
import { IMPORT_WORDS, IMPORT_VALUES_MAX, type WebImportRequest } from './import-request';
import { parseMarkup, type MarkupElement } from './markup';

const page = (text: string, type = 'text/html', url = 'https://example.com/'): FetchedPage => ({
  text,
  type,
  url,
});
const EMPTY = { error: '#N/A', why: IMPORT_WORDS.empty };
const data: WebImportRequest = { kind: 'data', url: 'https://example.com/' };
const html = (query: 'table' | 'list', index: number): WebImportRequest => ({
  kind: 'html',
  url: 'https://example.com/',
  query,
  index,
});
const xml = (xpath: string): WebImportRequest => ({
  kind: 'xml',
  url: 'https://example.com/',
  xpath,
});

describe('IMPORTDATA', () => {
  it('reads comma-separated rows, made even', () => {
    expect(extractImport(data, page('a,b\n"c,d"', 'text/csv'))).toEqual({
      rows: [
        ['a', 'b'],
        ['c,d', ''],
      ],
    });
  });

  it('reads tabs when the type or the path says so', () => {
    expect(extractImport(data, page('a\tb', 'text/tab-separated-values'))).toEqual({
      rows: [['a', 'b']],
    });
    expect(extractImport(data, page('a\tb,c', '', 'https://x.org/f.TSV'))).toEqual({
      rows: [['a', 'b,c']],
    });
    expect(isTabSeparated(page('', '', 'not a url'))).toBe(false);
  });

  it('is empty for a blank file', () => {
    expect(extractImport(data, page(' \n', 'text/csv'))).toEqual(EMPTY);
  });

  it('refuses an answer past the import’s bound, and cuts a long text', () => {
    const wide = Array.from({ length: 101 }, () => 'x').join(',');
    expect(extractImport(data, page(`${wide}\n`.repeat(1000), 'text/csv'))).toEqual({
      error: '#N/A',
      why: IMPORT_WORDS.tooLarge,
    });
    const long = extractImport(data, page('y'.repeat(10_050), 'text/csv'));
    expect('rows' in long && long.rows[0]![0]!.length).toBe(10_000);
  });
});

describe('IMPORTHTML', () => {
  const PAGE = `<table><tr><th>h</th></tr><tr><td> a <b>b</b></td></tr></table>
    <ul><li>one<ul><li>inner</ul><li>two</ul>
    <table><tr><td><table><tr><td>nested</table><td>outer</table>
    <ol><li>x</ol>`;

  it('counts tables and lists apart, each in the order the page opens them', () => {
    expect(extractImport(html('table', 1), page(PAGE))).toEqual({ rows: [['h'], ['a b']] });
    expect(extractImport(html('table', 2), page(PAGE))).toEqual({ rows: [['nested', 'outer']] });
    expect(extractImport(html('table', 3), page(PAGE))).toEqual({ rows: [['nested']] });
    expect(extractImport(html('list', 1), page(PAGE))).toEqual({ rows: [['one inner'], ['two']] });
    expect(extractImport(html('list', 2), page(PAGE))).toEqual({ rows: [['inner']] });
    expect(extractImport(html('list', 3), page(PAGE))).toEqual({ rows: [['x']] });
  });

  it('is empty past the last, or for a table with no cells', () => {
    expect(extractImport(html('table', 4), page(PAGE))).toEqual(EMPTY);
    expect(extractImport(html('list', 9), page(PAGE))).toEqual(EMPTY);
    expect(extractImport(html('table', 1), page('<table></table>'))).toEqual(EMPTY);
    expect(extractImport(html('table', 1), page('<table><tr></tr></table>'))).toEqual(EMPTY);
  });

  it('puts a spanning cell’s text in its first place, the rest empty', () => {
    const t = parseMarkup(
      `<table><tr><td rowspan="2">a</td><td colspan=2>b</td><td rowspan=x>c</td></tr>
        <tr><td>d</td><td>e</td><td>f</td></tr><tr><td colspan="99999">g</td></tr></table>`,
      'html',
    ).children[0] as MarkupElement;
    const rows = tableRows(t);
    expect(rows.slice(0, 2)).toEqual([
      ['a', 'b', '', 'c'],
      ['', 'd', 'e', 'f'],
    ]);
    expect(rows[2]!.length).toBe(1);
  });

  it('leaves a row a span above fills whole', () => {
    const t = parseMarkup('<table><tr><td rowspan=2>a</td></tr><tr></tr></table>', 'html')
      .children[0] as MarkupElement;
    expect(tableRows(t)).toEqual([['a'], []]);
  });
});

describe('IMPORTXML', () => {
  it('answers each node a row, an element of elements one column each', () => {
    const p = page(
      '<table><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></table><a href="/x">x</a>',
    );
    expect(extractImport(xml('//tr'), p)).toEqual({
      rows: [
        ['1', '2'],
        ['3', ''],
      ],
    });
    expect(extractImport(xml('//a/@href'), p)).toEqual({ rows: [['/x']] });
    expect(extractImport(xml('//td/text()'), p)).toEqual({ rows: [['1'], ['2'], ['3']] });
  });

  it('answers a number, text or boolean as one value', () => {
    const p = page('<p>a</p><p>b</p>');
    expect(extractImport(xml('count(//p)'), p)).toEqual({ rows: [['2']] });
    expect(extractImport(xml('string(//p)'), p)).toEqual({ rows: [['a']] });
    expect(extractImport(xml('count(//p) = 2'), p)).toEqual({ rows: [['TRUE']] });
  });

  it('reads XML by its type or its declaration, names as written', () => {
    expect(isXml(page('<x/>', 'application/rss+xml; charset=utf-8'))).toBe(true);
    expect(isXml(page(' <?xml version="1.0"?><x/>', ''))).toBe(true);
    expect(isXml(page('<?xml version="1.0"?><html/>', 'application/xhtml+html'))).toBe(false);
    expect(isXml(page('<x/>', 'text/plain'))).toBe(false);
    const p = page('<?xml version="1.0"?><Root><Item>1</Item></Root>', 'text/xml');
    expect(extractImport(xml('//Item'), p)).toEqual({ rows: [['1']] });
  });

  it('is empty when nothing is selected; refuses a query it cannot read or work out', () => {
    const p = page('<p>a</p>');
    expect(extractImport(xml('//q'), p)).toEqual(EMPTY);
    expect(extractImport(xml('//p['), p)).toEqual({
      error: '#VALUE!',
      why: 'The query ends too soon',
    });
    expect(extractImport(xml('count(1)'), p)).toEqual({
      error: '#N/A',
      why: 'count() needs nodes',
    });
  });
});

describe('IMPORTFEED', () => {
  const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
    <title>News</title><link>https://n.example/</link><description>All of it</description>
    <managingEditor>ed@n.example</managingEditor>
    <item><title>One</title><link>https://n.example/1</link><dc:creator>Ann</dc:creator>
      <pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;Hello &lt;a href="x"&gt;world&lt;/a&gt;&lt;img src="i"&gt;&lt;/p&gt;</description></item>
    <item><title>Two</title><guid>https://n.example/2</guid><description>Plain</description></item>
  </channel></rss>`;
  const feed = (query: string, headers = false, items: number | null = null): WebImportRequest => ({
    kind: 'feed',
    url: 'https://n.example/feed',
    query,
    headers,
    items,
  });

  it('answers the items table, its columns Google’s', () => {
    expect(extractImport(feed('items', true, 1), page(RSS, 'application/rss+xml'))).toEqual({
      rows: [
        ['Title', 'Author', 'URL', 'Date Created', 'Summary'],
        ['One', 'Ann', 'https://n.example/1', 'Sat, 21 Nov 2026 10:00:00 GMT', 'Hello world'],
      ],
    });
    expect(extractImport(feed('items url'), page(RSS))).toEqual({
      rows: [['https://n.example/1'], ['https://n.example/2']],
    });
    expect(extractImport(feed('items summary', true), page(RSS))).toEqual({
      rows: [['Summary'], ['Hello world'], ['Plain']],
    });
  });

  it('answers the feed itself', () => {
    expect(extractImport(feed('feed', true), page(RSS))).toEqual({
      rows: [
        ['Title', 'Description', 'URL'],
        ['News', 'All of it', 'https://n.example/'],
      ],
    });
    expect(extractImport(feed('feed author'), page(RSS))).toEqual({ rows: [['ed@n.example']] });
  });

  it('reads Atom', () => {
    const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><subtitle>Notes</subtitle>
      <link rel="self" href="https://b.example/feed"/><link href="https://b.example/"/>
      <author><name>Bo</name></author>
      <entry><title>Hi</title><link rel="alternate" href="https://b.example/hi"/><updated>2026-11-20</updated>
        <author><name>Cy</name></author><content type="html">&lt;b&gt;Bold&lt;/b&gt; move</content></entry>
      <entry><title>Bare</title><link rel="enclosure" href="https://b.example/f.mp3"/><author>Di</author>
        <summary>Short</summary></entry>
      <entry><title>None</title><link rel="alternate"/></entry></feed>`;
    expect(extractImport(feed('items'), page(ATOM))).toEqual({
      rows: [
        ['Hi', 'Cy', 'https://b.example/hi', '2026-11-20', 'Bold move'],
        ['Bare', 'Di', 'https://b.example/f.mp3', '', 'Short'],
        ['None', '', '', '', ''],
      ],
    });
    expect(extractImport(feed('feed', false), page(ATOM))).toEqual({
      rows: [['Blog', 'Notes', 'https://b.example/']],
    });
    expect(extractImport(feed('feed author'), page(ATOM))).toEqual({ rows: [['Bo']] });
    expect(extractImport(feed('feed url'), page('<feed><title>x</title></feed>'))).toEqual({
      rows: [['']],
    });
  });

  it('reads RSS 1.0, its items beside the channel', () => {
    const RDF = `<rdf:RDF xmlns:rdf="r"><channel><title>R</title></channel>
      <item><title>i1</title><link>u1</link><dc:date>2026-01-01</dc:date></item></rdf:RDF>`;
    expect(extractImport(feed('items'), page(RDF))).toEqual({
      rows: [['i1', '', 'u1', '2026-01-01', '']],
    });
  });

  it('refuses a page that is no feed, and is empty for a feed of no items', () => {
    const notFeed = { error: '#N/A', why: 'The page is not an RSS or Atom feed' };
    expect(extractImport(feed('items'), page('<html></html>'))).toEqual(notFeed);
    expect(extractImport(feed('items'), page(''))).toEqual(notFeed);
    expect(extractImport(feed('items'), page('<rss></rss>'))).toEqual(notFeed);
    expect(extractImport(feed('items'), page('<rss><channel></channel></rss>'))).toEqual(EMPTY);
  });
});

describe('the bound on an answer', () => {
  it('holds every kind to it', () => {
    expect(IMPORT_VALUES_MAX).toBe(100_000);
  });
});
