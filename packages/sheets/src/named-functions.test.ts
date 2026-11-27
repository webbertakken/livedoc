// Named functions (docs/specs/029-sheets/formulas.md "Named functions", data-tools.md "Named ranges and named functions").
import { describe, expect, it } from 'vitest';
import {
  NAMED_FUNCTION_BODY_MAX,
  NAMED_FUNCTION_DESCRIPTION_MAX,
  NAMED_FUNCTION_HINT_MAX,
  NAMED_FUNCTION_NAME_MAX,
  NAMED_FUNCTION_PARAMS_MAX,
  NAMED_FUNCTIONS_MAX,
  NamedFunction,
  namedFunctionProblem,
  readNamedFunctions,
} from './named-functions';

const CONTAINS: NamedFunction = {
  name: 'CONTAINS',
  params: ['search_query', 'search_range'],
  body: '=NOT(ISERROR(MATCH(search_query, search_range, 0)))',
};
const fn = (over: Partial<NamedFunction>): NamedFunction => ({ ...CONTAINS, ...over });

describe('namedFunctionProblem', () => {
  it('passes a well made function', () => {
    expect(namedFunctionProblem(CONTAINS, [])).toBeNull();
  });

  it('refuses a name of the wrong shape', () => {
    for (const name of ['', '1ABC', 'A-B', 'A.B', 'A B', 'X'.repeat(NAMED_FUNCTION_NAME_MAX + 1)])
      expect(namedFunctionProblem(fn({ name }), [])).toEqual({
        field: 'name',
        message: 'Names start with a letter or _, then letters, digits or _',
      });
  });

  it('allows a name of the longest length', () => {
    expect(namedFunctionProblem(fn({ name: 'X'.repeat(NAMED_FUNCTION_NAME_MAX) }), [])).toBeNull();
  });

  it('refuses a built-in function’s name, TRUE, FALSE and a cell-like name', () => {
    expect(namedFunctionProblem(fn({ name: 'sum' }), [])).toEqual({
      field: 'name',
      message: 'SUM is a built-in function',
    });
    expect(namedFunctionProblem(fn({ name: 'true' }), [])?.message).toBe(
      'TRUE and FALSE cannot be names',
    );
    expect(namedFunctionProblem(fn({ name: 'AB12' }), [])?.message).toBe(
      'That reads as a cell reference',
    );
    expect(namedFunctionProblem(fn({ name: 'R1C1' }), [])?.message).toBe(
      'That reads as a cell reference',
    );
  });

  it('refuses a name another named function has, case aside', () => {
    expect(namedFunctionProblem(fn({ name: 'contains' }), [CONTAINS])).toEqual({
      field: 'name',
      message: 'Another named function is called that',
    });
  });

  it('refuses an argument of the wrong shape, cell-like or repeated, naming its place', () => {
    expect(namedFunctionProblem(fn({ params: ['ok', '2x'] }), [])).toEqual({
      field: 'argument',
      index: 1,
      message: 'Arguments start with a letter or _, then letters, digits or _',
    });
    expect(namedFunctionProblem(fn({ params: ['a1'] }), [])).toEqual({
      field: 'argument',
      index: 0,
      message: 'That reads as a cell reference',
    });
    expect(namedFunctionProblem(fn({ params: ['false'] }), [])?.message).toBe(
      'TRUE and FALSE cannot be names',
    );
    expect(namedFunctionProblem(fn({ params: ['x', 'X'] }), [])).toEqual({
      field: 'argument',
      index: 1,
      message: 'Each argument needs its own name',
    });
  });

  it('refuses more arguments than the bound', () => {
    const params = Array.from({ length: NAMED_FUNCTION_PARAMS_MAX + 1 }, (_, i) => `p_${i}`);
    expect(namedFunctionProblem(fn({ params, body: '=1' }), [])).toEqual({
      field: 'argument',
      index: NAMED_FUNCTION_PARAMS_MAX,
      message: `A named function takes up to ${NAMED_FUNCTION_PARAMS_MAX} arguments`,
    });
  });

  it('refuses a definition that cannot be read, or is too long', () => {
    expect(namedFunctionProblem(fn({ body: '=SUM(' }), [])).toEqual({
      field: 'definition',
      message: "That formula can't be read",
    });
    expect(namedFunctionProblem(fn({ body: '' }), [])?.message).toBe("That formula can't be read");
    expect(
      namedFunctionProblem(fn({ body: `="${'x'.repeat(NAMED_FUNCTION_BODY_MAX)}"` }), []),
    ).toEqual({
      field: 'definition',
      message: `A definition holds up to ${NAMED_FUNCTION_BODY_MAX} characters`,
    });
  });

  it('accepts a definition without its = and one never reading a placeholder', () => {
    expect(namedFunctionProblem(fn({ body: 'search_query*2' }), [])).toBeNull();
    expect(namedFunctionProblem(fn({ body: '=42' }), [])).toBeNull();
  });

  it('refuses a description or hint past its bound', () => {
    expect(
      namedFunctionProblem(fn({ description: 'd'.repeat(NAMED_FUNCTION_DESCRIPTION_MAX + 1) }), []),
    ).toEqual({
      field: 'description',
      message: `A description holds up to ${NAMED_FUNCTION_DESCRIPTION_MAX} characters`,
    });
    expect(
      namedFunctionProblem(
        fn({ hints: [null, { example: 'e'.repeat(NAMED_FUNCTION_HINT_MAX + 1) }] }),
        [],
      ),
    ).toEqual({
      field: 'argument',
      index: 1,
      message: `An argument’s description and example hold up to ${NAMED_FUNCTION_HINT_MAX} characters`,
    });
    expect(namedFunctionProblem(fn({ hints: [null, null, null] }), [])?.field).toBe('argument');
  });
});

describe('NamedFunction', () => {
  it('saves the name in capitals, the definition with its =, and drops empty extras', () => {
    expect(
      NamedFunction.normalised({
        name: ' contains ',
        params: [' a '],
        body: ' a*2 ',
        description: '  ',
        hints: [{ description: '', example: '' }],
      }),
    ).toEqual({ name: 'CONTAINS', params: ['a'], body: '=a*2' });
    expect(
      NamedFunction.normalised({
        ...CONTAINS,
        description: 'Whether it is there',
        hints: [{ description: 'what' }, { example: '' }],
      }),
    ).toEqual({
      ...CONTAINS,
      description: 'Whether it is there',
      hints: [{ description: 'what' }],
    });
  });

  it('writes its call as the list shows it', () => {
    expect(NamedFunction.callText(CONTAINS)).toBe('CONTAINS(search_query, search_range)');
    expect(NamedFunction.callText(fn({ params: [] }))).toBe('CONTAINS()');
  });

  it('keeps a list in name order with one taking the place of its namesake', () => {
    const a = fn({ name: 'B_FN' });
    const b = fn({ name: 'A_FN' });
    expect(NamedFunction.sorted([a, b]).map((x) => x.name)).toEqual(['A_FN', 'B_FN']);
    const list = NamedFunction.put([a, b], fn({ name: 'B_FN', body: '=2' }), 'b_fn');
    expect(list.map((x) => [x.name, x.body])).toEqual([
      ['A_FN', CONTAINS.body],
      ['B_FN', '=2'],
    ]);
    expect(NamedFunction.put([a], b).map((x) => x.name)).toEqual(['A_FN', 'B_FN']);
    expect(NamedFunction.find([a, b], 'a_fn')).toBe(b);
    expect(NamedFunction.find([a], 'nope')).toBeUndefined();
    expect(NamedFunction.without([a, b], 'a_fn').map((x) => x.name)).toEqual(['B_FN']);
  });
});

describe('readNamedFunctions', () => {
  it('reads a saved list', () => {
    const list = [CONTAINS, fn({ name: 'TWICE', params: ['x'], body: '=x*2', hints: [null] })];
    expect(readNamedFunctions(list)).toEqual(list);
    expect(readNamedFunctions([])).toEqual([]);
    const hinted = fn({ hints: [{ description: 'd' }, { example: 'e' }] });
    expect(readNamedFunctions([hinted])).toEqual([hinted]);
  });

  it('refuses what is not a list of well made functions', () => {
    expect(readNamedFunctions('x')).toBeNull();
    expect(readNamedFunctions([1])).toBeNull();
    expect(readNamedFunctions([{ name: 'X', params: 'a', body: '=1' }])).toBeNull();
    expect(readNamedFunctions([{ name: 'X', params: [1], body: '=1' }])).toBeNull();
    expect(readNamedFunctions([{ name: 'X', params: [], body: 1 }])).toBeNull();
    expect(readNamedFunctions([{ ...CONTAINS, description: 2 }])).toBeNull();
    expect(readNamedFunctions([{ ...CONTAINS, hints: 'x' }])).toBeNull();
    expect(readNamedFunctions([{ ...CONTAINS, hints: [{ example: 3 }] }])).toBeNull();
    expect(readNamedFunctions([{ ...CONTAINS, hints: [7] }])).toBeNull();
    expect(readNamedFunctions([CONTAINS, CONTAINS])).toBeNull();
    expect(readNamedFunctions([fn({ body: '=A1' })])).toBeNull();
    expect(readNamedFunctions([fn({ name: 'contains' })])).toBeNull();
    expect(
      readNamedFunctions(
        Array.from({ length: NAMED_FUNCTIONS_MAX + 1 }, (_, i) => fn({ name: `F_${i}` })),
      ),
    ).toBeNull();
  });
});
