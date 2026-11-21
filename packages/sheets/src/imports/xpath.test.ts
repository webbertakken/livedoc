// XPath 1.0 for IMPORTXML (docs/specs/029-sheets/imports.md "The functions"): the expressions people write against
// pages, every axis, the core functions, the comparisons of node-sets, and the queries refused.
import { describe, expect, it } from 'vitest';
import { parseMarkup, textOf } from './markup';
import { evaluateXPath, numberText, XPATH_WORK_MAX, type XValue } from './xpath-eval';
import { parseXPath } from './xpath-parse';

const PAGE = parseMarkup(
  `<html><body>
    <h1 id="t">Title</h1>
    <ul class="nav main"><li><a href="/a">A</a></li><li><a href="/b">B</a></li><li>C</li></ul>
    <table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4.5</td></tr></table>
    <p>one <b>two</b> three</p>
  </body></html>`,
  'html',
);

function run(q: string, root = PAGE): XValue | { error: string } {
  const e = parseXPath(q);
  if ('error' in e) return e;
  return evaluateXPath(e, root);
}

// Node-sets as their texts; other values as they are.
function texts(q: string): unknown {
  const v = run(q);
  return Array.isArray(v) ? v.map((n) => textOf(n)) : v;
}

describe('paths', () => {
  it.each<[string, unknown]>([
    ['//h1', ['Title']],
    ['/html/body/h1', ['Title']],
    ['//a/@href', ['/a', '/b']],
    ['//li[2]/a', ['B']],
    ['//li[last()]', ['C']],
    ['//li[position() < 3]//text()', ['A', 'B']],
    ['//ul[@class="nav main"]/li[3]', ['C']],
    ['//ul[contains(@class, "nav")]/li[not(a)]', ['C']],
    ['//*[@id="t"]', ['Title']],
    ['//a[. = "B"]/..', ['B']],
    ['//td[. > 2]', ['3', '4.5']],
    ['(//td)[last()]', ['4.5']],
    ['(//td)[2]/following-sibling::*', []],
    ['//tr[2]/td[1]/preceding-sibling::td', []],
    ['//tr[1]/td[1]/following-sibling::td', ['2']],
    ['//tr[1]/td[2]/preceding-sibling::td', ['1']],
    ['//b/ancestor::p', ['one two three']],
    ['//b/ancestor-or-self::*[1]', ['two']],
    ['//b/parent::*/self::p', ['one two three']],
    ['//h1/following::a', ['A', 'B']],
    ['//td[.="3"]/preceding::td', ['1', '2']],
    ['//a/@href/following::li', ['B', 'C']],
    ['//p/descendant::text()', ['one ', 'two', ' three']],
    ['//p/descendant-or-self::b', ['two']],
    ['//h1 | //b', ['Title', 'two']],
    ['//h1/@*', ['t']],
    ['//a/child::node()', ['A', 'B']],
    ['//comment()', []],
    ['//processing-instruction("x")', []],
    ['//h1/attribute::id', ['t']],
    ['/', [textOf(PAGE)]],
    ['//li[a][1]/a/text()', ['A']],
    ['//x:y', []],
    ['//x:*', []],
    ['(//ul)//a', ['A', 'B']],
    ['//h1[following::a][following::td]', ['Title']],
    ['//text()/@x', []],
    ['/..', []],
    ['//h1/text()/descendant::node()', []],
    ['//@href/following-sibling::*', []],
    ['/following-sibling::*', []],
  ])('%s selects %j', (q, want) => {
    expect(texts(q)).toEqual(want);
  });
});

describe('values and functions', () => {
  it.each<[string, unknown]>([
    ['count(//li)', 3],
    ['count(//li) * 2 - 1 div 2 + 7 mod 4', 8.5],
    ['-count(//li)', -3],
    ['sum(//td)', 10.5],
    ['string(//h1)', 'Title'],
    ['string(//nothing)', ''],
    ['concat("a", 1, true())', 'a1true'],
    ['concat(false(), "")', 'false'],
    ['name(/)', ''],
    ['name(//h1/text())', ''],
    ['starts-with("abc", "ab")', true],
    ['substring-before("a-b", "-")', 'a'],
    ['substring-before("ab", "-")', ''],
    ['substring-after("a-b", "-")', 'b'],
    ['substring-after("ab", "-")', ''],
    ['substring("12345", 2, 3)', '234'],
    ['substring("12345", 2)', '2345'],
    ['string-length("abc")', 3],
    ['normalize-space("  a \n b ")', 'a b'],
    ['translate("abc", "ab", "B")', 'Bc'],
    ['boolean(//li)', true],
    ['boolean("")', false],
    ['boolean(0)', false],
    ['boolean(1 div 0)', true],
    ['number("12")', 12],
    ['number("x")', NaN],
    ['number(true())', 1],
    ['number(false())', 0],
    ['floor(2.5)', 2],
    ['ceiling(2.1)', 3],
    ['round(2.5)', 3],
    ['round(-2.5)', -2],
    ['name(//a/@href)', 'href'],
    ['local-name(//nothing)', ''],
    ['true() and false()', false],
    ['false() or 1', true],
    ['1 = 1', true],
    ['"1" = 1', true],
    ['true() = "x"', true],
    ['1 != 2', true],
    ['2 <= 2', true],
    ['3 >= 4', false],
    ['1 < 2', true],
    ['//td = 4.5', true],
    ['//td != 1', true],
    ['//td = //li', false],
    ['//li = true()', true],
    ['false() = //nothing', true],
    ['//td > "3"', true],
  ])('%s is %j', (q, want) => {
    expect(texts(q)).toEqual(want);
  });

  it('reads string-length, normalize-space, string and number of the context node', () => {
    expect(texts('//li[string-length() = 1]')).toEqual(['A', 'B', 'C']);
    expect(texts('//td[number() > 3]')).toEqual(['4.5']);
    expect(texts('//li[normalize-space() = "C"]')).toEqual(['C']);
    expect(texts('//h1[string() = "Title"]/@id')).toEqual(['t']);
    expect(texts('//h1[name() = "h1"]')).toEqual(['Title']);
  });

  it('names a prefixed element whole, and its local name without the prefix', () => {
    const feed = parseMarkup('<rss><dc:creator>Ann</dc:creator></rss>', 'xml');
    const v = run('//dc:creator', feed);
    expect(Array.isArray(v) && v.map((n) => textOf(n))).toEqual(['Ann']);
    expect(run('local-name(//dc:*)', feed)).toBe('creator');
    expect(run('name(//dc:*)', feed)).toBe('dc:creator');
  });
});

describe('numberText', () => {
  it.each([
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
    [-0, '0'],
    [2, '2'],
    [2.5, '2.5'],
  ])('writes %s as %s', (n, s) => {
    expect(numberText(n)).toBe(s);
  });

  it('writes a number result as a string', () => {
    expect(texts('string(1 div 0)')).toBe('Infinity');
    expect(texts('string(1 = 1)')).toBe('true');
  });
});

describe('queries refused', () => {
  it.each([
    ['', 'The query is empty'],
    ['//a[', 'The query ends too soon'],
    ['//a]', 'Unexpected ]'],
    ['"open', 'A text in the query is not closed'],
    ['$x', 'Variables are not supported'],
    ['foo::a', 'There is no axis foo'],
    ['lang("en")', 'There is no function lang()'],
    ['//a#', 'The query cannot hold #'],
    ['count(1', 'The query ends too soon'],
    ['(1 2)', 'Expected )'],
    ['/@', 'The query ends too soon'],
    ['//(a)', 'A step needs a name or a node test'],
    [',', 'Unexpected ,'],
    ['('.repeat(1001), 'The query is too long'],
  ])('%j: %s', (q, error) => {
    expect(parseXPath(q)).toEqual({ error });
  });

  it.each([
    ['"a"/b', 'A path needs nodes to start from'],
    ['"a"[1]', 'Only nodes can be filtered'],
    ['1 | //a', 'Only nodes can be joined with |'],
    ['count(1)', 'count() needs nodes'],
  ])('%j cannot be worked out: %s', (q, error) => {
    expect(run(q)).toEqual({ error });
  });

  it('gives up on a query past its work', () => {
    const many = parseMarkup('<p></p>'.repeat(3000), 'html');
    expect(XPATH_WORK_MAX).toBeLessThan(3000 ** 2);
    expect(run('//p/following::p/preceding::p', many)).toEqual({
      error: 'The query is too costly for this page',
    });
  });
});
