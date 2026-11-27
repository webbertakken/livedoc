// Named functions (docs/specs/029-sheets/formulas.md "Named functions", data-tools.md "Named ranges and named
// functions"): a spreadsheet's own functions, kept on its workbook row. What one may be, how it is saved, and the
// list as the panel shows it. The engine compiles each definition once (engine/workbook.ts).
import { refsOf, type Node } from './formula/ast';
import { parseFormula } from './formula/parse';
import { FUNCTIONS } from './formula/registry';
import { CELL_LIKE } from './range-names';

// The bounds (D302): Google's name length; the rest LiveDoc's.
export const NAMED_FUNCTION_NAME_MAX = 254;
export const NAMED_FUNCTION_PARAMS_MAX = 20;
export const NAMED_FUNCTION_BODY_MAX = 2_000;
export const NAMED_FUNCTION_DESCRIPTION_MAX = 1_000;
export const NAMED_FUNCTION_HINT_MAX = 200;
export const NAMED_FUNCTIONS_MAX = 100;
// How deep named functions call each other before the formula is #NUM! (D300).
export const NAMED_FUNCTION_DEPTH_MAX = 100;

/** An argument's description and example, as the function help shows them. */
export type NamedFunctionHint = { readonly description?: string; readonly example?: string };

export type NamedFunction = {
  // Saved in capitals.
  readonly name: string;
  // The argument placeholders, as typed.
  readonly params: readonly string[];
  // The definition, `=` first.
  readonly body: string;
  readonly description?: string;
  // By placeholder index; null where a placeholder has none. Absent when none has one.
  readonly hints?: readonly (NamedFunctionHint | null)[];
};

export type NamedFunctionField = 'name' | 'argument' | 'definition' | 'description';
export type NamedFunctionProblem = {
  readonly field: NamedFunctionField;
  // The argument's place, for an argument's problem.
  readonly index?: number;
  readonly message: string;
};

export const NAMED_FUNCTION_TAKEN = 'Another named function is called that';
export const NAMED_FUNCTION_UNREADABLE = "That formula can't be read";
export const NAMED_FUNCTION_REFERENCE = 'Pass the cell as an argument, or use a named range';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sameName = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

// Why a name (of a function or a placeholder) cannot be one, or null.
function identifierProblem(name: string, shape: string): string | null {
  if (!IDENTIFIER.test(name)) return shape;
  if (/^(true|false)$/i.test(name)) return 'TRUE and FALSE cannot be names';
  if (CELL_LIKE.test(name)) return 'That reads as a cell reference';
  return null;
}

function nameProblem(name: string, others: readonly NamedFunction[]): string | null {
  const shape = 'Names start with a letter or _, then letters, digits or _';
  if (name.length > NAMED_FUNCTION_NAME_MAX) return shape;
  const problem = identifierProblem(name, shape);
  if (problem) return problem;
  const upper = name.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(FUNCTIONS, upper))
    return `${upper} is a built-in function`;
  if (others.some((o) => sameName(o.name, name))) return NAMED_FUNCTION_TAKEN;
  return null;
}

function argumentProblem(fn: NamedFunction): NamedFunctionProblem | null {
  const at = (index: number, message: string) => ({ field: 'argument' as const, index, message });
  if (fn.params.length > NAMED_FUNCTION_PARAMS_MAX)
    return at(
      NAMED_FUNCTION_PARAMS_MAX,
      `A named function takes up to ${NAMED_FUNCTION_PARAMS_MAX} arguments`,
    );
  for (const [i, p] of fn.params.entries()) {
    const problem = identifierProblem(
      p,
      'Arguments start with a letter or _, then letters, digits or _',
    );
    if (problem) return at(i, problem);
    if (fn.params.slice(0, i).some((q) => sameName(q, p)))
      return at(i, 'Each argument needs its own name');
  }
  const hints = fn.hints ?? [];
  if (hints.length > fn.params.length)
    return at(fn.params.length, 'Each description and example belongs to an argument');
  const long = (s?: string) => (s?.length ?? 0) > NAMED_FUNCTION_HINT_MAX;
  const i = hints.findIndex((h) => h !== null && (long(h.description) || long(h.example)));
  if (i >= 0)
    return at(
      i,
      `An argument’s description and example hold up to ${NAMED_FUNCTION_HINT_MAX} characters`,
    );
  return null;
}

function definitionProblem(body: string): string | null {
  if (body.length > NAMED_FUNCTION_BODY_MAX)
    return `A definition holds up to ${NAMED_FUNCTION_BODY_MAX} characters`;
  const parsed = parseFormula(body);
  if (!parsed.ok) return NAMED_FUNCTION_UNREADABLE;
  // D301: a definition reads cells through its placeholders and named ranges.
  return refsOf(parsed.ast).length > 0 ? NAMED_FUNCTION_REFERENCE : null;
}

/**
 * Why `fn` cannot be saved beside `others` (the workbook's other named functions, the one edited left out), or null
 * when it can. Fields are checked in the form's order.
 */
export function namedFunctionProblem(
  fn: NamedFunction,
  others: readonly NamedFunction[],
): NamedFunctionProblem | null {
  const name = nameProblem(fn.name, others);
  if (name) return { field: 'name', message: name };
  if ((fn.description?.length ?? 0) > NAMED_FUNCTION_DESCRIPTION_MAX)
    return {
      field: 'description',
      message: `A description holds up to ${NAMED_FUNCTION_DESCRIPTION_MAX} characters`,
    };
  const argument = argumentProblem(fn);
  if (argument) return argument;
  const definition = definitionProblem(fn.body);
  return definition ? { field: 'definition', message: definition } : null;
}

function normalisedHint(h: NamedFunctionHint | null | undefined): NamedFunctionHint | null {
  const description = h?.description?.trim() ?? '';
  const example = h?.example?.trim() ?? '';
  if (!description && !example) return null;
  return { ...(description ? { description } : {}), ...(example ? { example } : {}) };
}

export const NamedFunction = {
  /** A function as saved: the name in capitals, everything trimmed, the definition `=` first, empty extras dropped. */
  normalised: (fn: NamedFunction): NamedFunction => {
    const body = fn.body.trim();
    const description = fn.description?.trim() ?? '';
    const hints = (fn.hints ?? []).map(normalisedHint);
    while (hints.length > 0 && hints[hints.length - 1] === null) hints.pop();
    return {
      name: fn.name.trim().toUpperCase(),
      params: fn.params.map((p) => p.trim()),
      body: body.startsWith('=') ? body : `=${body}`,
      ...(description ? { description } : {}),
      ...(hints.length > 0 ? { hints } : {}),
    };
  },

  /** Its call as the list and the function help write it: `CONTAINS(search_query, search_range)`. */
  callText: (fn: NamedFunction): string => `${fn.name}(${fn.params.join(', ')})`,

  /** The list in name order. */
  sorted: (list: readonly NamedFunction[]): NamedFunction[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name)),

  /** The list with `fn` added, or in the place of `was` (its old name) or its namesake, in name order. */
  put: (list: readonly NamedFunction[], fn: NamedFunction, was?: string): NamedFunction[] =>
    NamedFunction.sorted([
      ...list.filter((x) => !sameName(x.name, fn.name) && !(was && sameName(x.name, was))),
      fn,
    ]),

  /** The list without the function of that name. */
  without: (list: readonly NamedFunction[], name: string): NamedFunction[] =>
    list.filter((x) => !sameName(x.name, name)),

  /** The one of that name, case aside. */
  find: (list: readonly NamedFunction[], name: string): NamedFunction | undefined =>
    list.find((x) => sameName(x.name, name)),
} as const;

const optionalText = (v: unknown): v is string | undefined =>
  v === undefined || typeof v === 'string';

function readHint(raw: unknown): NamedFunctionHint | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const { description, example } = raw as Record<string, unknown>;
  if (!optionalText(description) || !optionalText(example)) return undefined;
  return {
    ...(description === undefined ? {} : { description }),
    ...(example === undefined ? {} : { example }),
  };
}

function readOne(raw: unknown): NamedFunction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { name, params, body, description, hints } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || typeof body !== 'string' || !optionalText(description))
    return null;
  if (!Array.isArray(params) || !params.every((p): p is string => typeof p === 'string'))
    return null;
  let read: (NamedFunctionHint | null)[] | undefined;
  if (hints !== undefined) {
    if (!Array.isArray(hints)) return null;
    read = hints.map(readHint) as (NamedFunctionHint | null)[];
    if (read.includes(undefined as never)) return null;
  }
  if (name !== name.toUpperCase()) return null;
  return {
    name,
    params,
    body,
    ...(description === undefined ? {} : { description }),
    ...(read ? { hints: read } : {}),
  };
}

/** A named function as the engine calls it: its placeholders in capitals (as scope names are) and its definition read. */
export type NamedFunctionDef = {
  readonly name: string;
  readonly params: readonly string[];
  readonly ast: Node;
};

/** The engine's functions by name: each definition read once; one that cannot be read is left out (its calls #NAME?). */
export function compileNamedFunctions(
  list: readonly NamedFunction[],
): ReadonlyMap<string, NamedFunctionDef> {
  const defs = new Map<string, NamedFunctionDef>();
  for (const fn of list) {
    const parsed = parseFormula(fn.body);
    if (!parsed.ok) continue;
    const name = fn.name.toUpperCase();
    defs.set(name, { name, params: fn.params.map((p) => p.toUpperCase()), ast: parsed.ast });
  }
  return defs;
}

/** A list from the wire or the room: every function well made and saved as one is, at most the bound; else null. */
export function readNamedFunctions(raw: unknown): NamedFunction[] | null {
  if (!Array.isArray(raw) || raw.length > NAMED_FUNCTIONS_MAX) return null;
  const list: NamedFunction[] = [];
  for (const item of raw) {
    const fn = readOne(item);
    if (!fn || namedFunctionProblem(fn, list)) return null;
    list.push(fn);
  }
  return list;
}
