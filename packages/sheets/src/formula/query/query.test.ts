import { describe, expect, it } from 'vitest';
import { book } from '../../testing/book';
import { evaluateQuery, compareQueryValues } from './query-eval';
import { parseQuery, QueryFailure } from './query-parse';
import { runQuery, type QueryResult } from './query-run';
import { queryTable, type QueryTable } from './query-table';

// formulas.md "QUERY"; the oracle (Google) holds the reference's documented answers, these the edges.
const DATA = [
  ['Name', 'Dept', 'Salary', 'Senior'],
  ['John', 'Eng', 1000, true],
  ['Dave', 'Eng', 500, false],
  ['Ben', 'Sales', 400, true],
  ['Mike', null, 800, 'yes'],
];

const table = (rows: unknown[][] = DATA, headers = 1, firstCol: number | null = 0) =>
  queryTable(rows as never, headers, firstCol) as QueryTable;

const run = (text: string, t: QueryTable = table()) =>
  runQuery(parseQuery(text), t, 46000.5) as QueryResult;
const fails = (text: string, t?: QueryTable) => {
  try {
    run(text, t);
  } catch (e) {
    expect(e).toBeInstanceOf(QueryFailure);
    return (e as Error).message;
  }
  throw new Error(`${text} ran`);
};

describe('reading a query', () => {
  it('reads every clause in order, keywords in any case', () => {
    const q = parseQuery(
      "SELECT A, B where C > 1 GROUP BY A, B PIVOT D ORDER BY A desc, B asc LIMIT 5 OFFSET 2 LABEL A 'x' FORMAT A '0' OPTIONS no_format",
    );
    expect(q.select).toHaveLength(2);
    expect(q.orderBy.map((o) => o.desc)).toEqual([true, false]);
    expect([q.limit, q.offset, q.labels[0]!.text, q.formats[0]!.text, q.options]).toEqual([
      5,
      2,
      'x',
      '0',
      ['no_format'],
    ]);
  });

  it('reads literals of every kind', () => {
    const lit = (text: string) => {
      const e = parseQuery(`select ${text}`).select![0]!;
      return e.k === 'lit' ? e.v : e;
    };
    expect(lit('.5')).toBe(0.5);
    expect(lit('1e3')).toBe(1000);
    expect(lit('"it\'s"')).toBe("it's");
    expect(lit('FALSE')).toBe(false);
    expect(lit("date '2008-03-18'")).toBe(39525);
    expect(lit("timeofday '12:00:00'")).toBe(0.5);
    expect(lit("datetime '2008-03-18 12:00:00.5'")).toBeCloseTo(39525.5000058, 6);
    expect(lit("timestamp '2008-03-18 06:00:00'")).toBe(39525.25);
    expect(lit('`A`')).toEqual({ k: 'col', id: 'A' });
    expect(lit('date')).toEqual({ k: 'col', id: 'date' });
  });

  it('names what does not read', () => {
    for (const [text, why] of [
      ['select A from B', 'Unexpected "from"'],
      ["select 'a", 'Unterminated text'],
      ['select `a', 'Unterminated name'],
      ['select A where', 'The query ends too soon'],
      ['select A limit x', 'Expected a whole number'],
      ['select A limit 1.5', 'Expected a whole number'],
      ['select (A', 'Expected ")"'],
      ['select A label A B', 'Expected text in quotes'],
      ['select ;', 'Unexpected ";"'],
      ['select )', 'Unexpected ")"'],
      ['select sum(A + B)', 'sum takes one column'],
      ['select nope(A)', 'Unknown function nope'],
      ['select now(A)', 'Unknown function now'],
      ['select A where A is B', 'Expected "null"'],
      ["select A where A starts 'x'", 'Expected "with"'],
      ["select date '2008'", '"2008" is not a date'],
      ["select timeofday '2008-01-01'", '"2008-01-01" is not a timeofday'],
      ["select datetime '2008-01-01'", '"2008-01-01" is not a datetime'],
      ['group A', 'Expected "by"'],
      ['limit 1 select A', 'Unexpected "select"'],
    ])
      expect(() => parseQuery(text!), text).toThrow(why!);
  });
});

describe('the table', () => {
  it('types each column by its majority, others null', () => {
    const t = table();
    expect(t.types).toEqual(['string', 'string', 'number', 'boolean']);
    expect(t.rows[3]).toEqual(['Mike', null, 800, null]);
    expect([...t.ids.keys()]).toEqual(['A', 'Col1', 'B', 'Col2', 'C', 'Col3', 'D', 'Col4']);
  });

  it('joins header rows and guesses one header', () => {
    expect(
      table(
        [
          ['a', 'b'],
          ['c', null],
          [1, 2],
        ],
        2,
      ).labels,
    ).toEqual(['a c', 'b']);
    expect(table(DATA, -1).headed).toBe(true);
    expect(table([['a'], ['b']], -1).headed).toBe(false);
    expect(table([[1], [2]], -1).headed).toBe(false);
    expect(table([['a']], -1).headed).toBe(false);
    expect(table([], 3).labels).toEqual([]);
  });

  it('answers with an error in the data', () => {
    expect(queryTable([[{ e: '#DIV/0!' }]], 0, null)).toEqual({ e: { e: '#DIV/0!' } });
  });
});

describe('running a query', () => {
  it('checks columns, aggregates and grouping', () => {
    expect(fails('select Z')).toBe('NO_COLUMN: Z');
    expect(fails('select A where sum(C) > 1')).toMatch(/^Aggregations are only allowed/);
    expect(fails('select sum(A)')).toBe(
      "Can't perform the function sum on values that are not numbers",
    );
    expect(fails('select * group by A')).toBe('Cannot select * when aggregating');
    expect(fails('select A, sum(C)')).toBe('ADD_COL_TO_GROUP_BY_OR_AGG: A');
    expect(fails('select 1, sum(C)')).toMatch(/^ADD_COL_TO_GROUP_BY_OR_AGG: \{/);
    expect(fails('select B, sum(C) group by B pivot B')).toMatch(/^A pivot column/);
    expect(fails('select sum(C) pivot B order by sum(C)')).toMatch(/^Cannot order by/);
  });

  it('selects everything and keeps the labels', () => {
    expect(run('select *').labels).toEqual(['Name', 'Dept', 'Salary', 'Senior']);
    expect(run('select *', table(DATA.slice(1), 0)).labels).toBeNull();
  });

  it('labels functions, arithmetic and negation', () => {
    expect(run('select lower(A), -C, C*2 limit 1').labels).toEqual([
      'lower(Name)',
      '-Salary',
      'Salary*2',
    ]);
    expect(run('select "x", 2 limit 1').labels).toEqual(['x', '2']);
    expect(run('select Col1 limit 1', table(DATA.slice(1), 0, null)).labels).toBeNull();
    expect(run("select sum(Col3) label sum(Col3) ''", table(DATA.slice(1), 0)).labels).toBeNull();
    expect(run('select max(Col1)', table(DATA.slice(1), 0)).labels).toEqual(['max Col1']);
  });

  it('labels a pivot by its values, and a given label after them', () => {
    const r = run("select A, sum(C) group by A pivot D label sum(C) 'pay'");
    expect(r.labels).toEqual(['Name', 'pay', 'FALSE pay', 'TRUE pay']);
    expect(run('select count(A) pivot B').labels).toEqual(['', 'Eng', 'Sales']);
  });

  it('aggregates, skipping nulls', () => {
    expect(run('select count(B), avg(C), min(A), max(A), sum(C)').rows).toEqual([
      [3, 675, 'Ben', 'Mike', 2700],
    ]);
    expect(run('select max(C), sum(C), avg(C) where C > 5000').rows).toEqual([[null, null, null]]);
  });

  it('orders with nulls first, by what select reads', () => {
    expect(run('select B order by B').rows).toEqual([[null], ['Eng'], ['Eng'], ['Sales']]);
    expect(run('select B, count(A) group by B order by count(A) desc, B').rows).toEqual([
      ['Eng', 2],
      [null, 1],
      ['Sales', 1],
    ]);
  });
});

describe('expressions', () => {
  const t = table();
  const at = (text: string, row: unknown[] = DATA[1]!) =>
    evaluateQuery(parseQuery(`select ${text}`).select![0]!, {
      table: t,
      row: row as never,
      rows: [row as never],
      now: 46000.5,
    });

  it('works out the scalar functions', () => {
    const day = 38430.75; // 2005-03-19 18:00
    const row = ['x', 'y', day, true];
    expect(
      ['year', 'month', 'day', 'hour', 'minute', 'second', 'quarter', 'dayOfWeek'].map((f) =>
        at(`${f}(C)`, row),
      ),
    ).toEqual([2005, 2, 19, 18, 0, 0, 1, 7]);
    expect(at("millisecond(datetime '2005-03-19 00:00:00.25')")).toBe(250);
    expect(at('now()')).toBe(46000.5);
    expect(at("dateDiff(date '2008-03-13', date '2008-02-12')")).toBe(30);
    expect(at("dateDiff(date '2008-03-13', 'x')")).toBeNull();
    expect(at('toDate(C)', row)).toBe(38430);
    expect(at('upper(A)')).toBe('JOHN');
    expect(at('upper(C)')).toBeNull();
    expect(at('year(A)')).toBeNull();
  });

  it('does arithmetic on numbers only, null for a division by zero', () => {
    expect([at('C+1'), at('C-1'), at('C*2'), at('C/4'), at('C/0'), at('A+1'), at('-A')]).toEqual([
      1001,
      999,
      2000,
      250,
      null,
      null,
      null,
    ]);
  });

  it('compares one type with itself, never with null or another type', () => {
    expect([
      at('C = 1000'),
      at('C != 1'),
      at('C < 1'),
      at('C <= 1000'),
      at('C > 1'),
      at('C >= 1'),
    ]).toEqual([true, true, false, true, true, true]);
    expect([at("C = 'a'"), at('B = 1', ['x', null]), at('A <> A')]).toEqual([false, false, false]);
    expect([
      compareQueryValues(null, null),
      compareQueryValues(null, 1),
      compareQueryValues(1, null),
    ]).toEqual([0, -1, 1]);
  });

  it('matches text, reading other values as text', () => {
    expect(at("A ends with 'hn'")).toBe(true);
    expect(at("D contains 'RU'")).toBe(true);
    expect(at("A like 'J_h.'")).toBe(false);
    expect(at("A like 'J_hn'")).toBe(true);
    expect(at("A matches '(a+)+(b+)+(c+)+(d+)+(e+)+$'", ['a'.repeat(5000)])).toBeNull();
    expect(at("B contains 'x'", ['x', null])).toBe(false);
  });

  it('joins conditions', () => {
    expect([
      at('A is null'),
      at('A is not null'),
      at('not C > 1'),
      at('C > 1 or C < 0'),
      at('C < 1 or C < 0'),
    ]).toEqual([false, true, false, true, false]);
  });
});

describe('QUERY', () => {
  const sheet = { A1: 'Name', B1: 'Pay', A2: 'Ann', B2: '10', A3: 'Bob', B3: '20', D1: 'select A' };
  const v = (formula: string) => {
    const b = book({ ...sheet, G1: formula }, { arrays: 'google' });
    return [b.v('G1'), b.v('G2'), b.v('G3')];
  };

  it('reads its query from a cell and spills its table', () => {
    expect(v('=QUERY(A1:B3, D1)')).toEqual(['Name', 'Ann', 'Bob']);
    expect(v('=QUERY(A1:B3, "select B where B > 15", 1)')).toEqual(['Pay', 20, null]);
  });

  it('answers with what its arguments fail with', () => {
    expect(v('=QUERY(A1:B3, 1/0)')[0]).toMatchObject({ e: '#DIV/0!' });
    expect(v('=QUERY(A1:B3, "select A", 1/0)')[0]).toMatchObject({ e: '#DIV/0!' });
    expect(v('=QUERY(1/0, "select *")')[0]).toMatchObject({ e: '#DIV/0!' });
    expect(v('=QUERY(SEQUENCE(1000, 101), "select *", 0)')[0]).toMatchObject({ e: '#NUM!' });
    expect(
      v(
        '=QUERY({SEQUENCE(400), SEQUENCE(400)}, "select Col1, count(Col2) group by Col1 pivot Col2", 0)',
      )[0],
    ).toMatchObject({ e: '#NUM!' });
    expect(v('=QUERY(A1:B3, "select Z")')[0]).toMatchObject({
      e: '#VALUE!',
      why: 'Unable to parse query string for Function QUERY parameter 2: NO_COLUMN: Z',
    });
    expect(v('=QUERY(A2:B3, "select A where B > 99", 0)')[0]).toMatchObject({ e: '#N/A' });
  });
});

describe('the rest of the language', () => {
  it('reads and, starts with, like with %, and a stray token', () => {
    expect(run("select A where C > 1 and A starts with 'J'").rows).toEqual([['John']]);
    expect(run("select A where C < 1 and A starts with 'J'").rows).toEqual([]);
    expect(run("select A where A like 'B%'").rows).toEqual([['Ben']]);
    expect(() => parseQuery('select A 5')).toThrow('Unexpected "5"');
  });

  it('keeps a format, labels a comparison empty, and pivots two aggregates', () => {
    expect(run("select A limit 1 format A 'x'").rows).toEqual([['John']]);
    expect(run('select A, C > 600 limit 1').labels).toEqual(['Name', '']);
    expect(run('select sum(C), count(A) pivot B').labels).toEqual([
      'sum Salary',
      'Eng sum Salary',
      'Sales sum Salary',
      'count Name',
      'Eng count Name',
      'Sales count Name',
    ]);
  });

  it('reads a column as null in a group of no rows', () => {
    expect(run('select count(A) where C > 5000 order by A').rows).toEqual([[0]]);
  });

  it('sorts values of two types by type', () => {
    expect([compareQueryValues('a', 1), compareQueryValues(true, 'a')]).toEqual([1, 1]);
  });

  it('refuses a pivot past the result budget', () => {
    const big = queryTable(
      Array.from({ length: 400 }, (_, i) => [i, i]),
      0,
      null,
    ) as QueryTable;
    expect(
      runQuery(parseQuery('select Col1, count(Col2) group by Col1 pivot Col2'), big, 0),
    ).toMatchObject({
      e: { e: '#NUM!' },
    });
  });
});
