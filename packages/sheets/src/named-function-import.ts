// Import Function (docs/specs/029-sheets/data-tools.md "Named ranges and named functions"): another spreadsheet's
// named functions brought into this one. A reference in a definition reads the sheet of its name here, `#REF!` while
// there is none (D184); a call to one of that spreadsheet's functions left behind is named beside the function.
import { childrenOf, type Node } from './formula/ast';
import { parseFormula } from './formula/parse';
import type { SheetHandle, SheetsCtx } from './formula/stored';
import { definitionText, withTypedDefinition } from './named-function-refs';
import { NamedFunction } from './named-functions';

/** The spreadsheet a function is imported from: its named functions and its sheets. */
export type FunctionSource = {
  readonly functions: readonly NamedFunction[];
  readonly sheets: readonly SheetHandle[];
};

// What the source's own sheets read as: by id and by title (its definitions name its sheets by id).
function sourceCtx(sheets: readonly SheetHandle[]): SheetsCtx {
  const own = { id: '', title: '', layout: { rows: [], cols: [] } };
  return {
    own,
    byId: (id) => sheets.find((s) => s.id === id),
    byTitle: (title) => sheets.find((s) => s.title.toLowerCase() === title.toLowerCase()),
  };
}

/** `fn` of `source` as it reads here (`target` is the sheet open here): its references by their sheets' names. */
export function importedFunction(
  fn: NamedFunction,
  source: FunctionSource,
  target: SheetsCtx,
): NamedFunction {
  if (!fn.refs?.length) return fn;
  return withTypedDefinition(fn, definitionText(fn, sourceCtx(source.sheets)), target, 'en-GB');
}

/** The list here with `picked` of `source` imported, each in the place of its namesake. */
export function withImported(
  here: readonly NamedFunction[],
  picked: readonly NamedFunction[],
  source: FunctionSource,
  target: SheetsCtx,
): NamedFunction[] {
  return picked.reduce<NamedFunction[]>(
    (list, fn) => NamedFunction.put(list, importedFunction(fn, source, target)),
    [...here],
  );
}

// Every function name a definition calls, or hands to a helper bare (`MAP(r, DOUBLE)`), in capitals.
function namesUsed(node: Node, out: Set<string>): Set<string> {
  if (node.k === 'call' || node.k === 'name')
    out.add((node.k === 'call' ? node.name : node.v).toUpperCase());
  for (const child of childrenOf(node)) namesUsed(child, out);
  return out;
}

/**
 * The source's named functions `fn` calls that are neither among `picked` nor `here` (by name, case aside), in
 * name order: those calls would read `#NAME?` once it is imported.
 */
export function callsLeftBehind(
  fn: NamedFunction,
  source: readonly NamedFunction[],
  picked: readonly NamedFunction[],
  here: readonly NamedFunction[],
): string[] {
  const parsed = parseFormula(fn.body, true);
  if (!parsed.ok) return [];
  const has = (list: readonly NamedFunction[], name: string) => !!NamedFunction.find(list, name);
  const params = new Set(fn.params.map((p) => p.toUpperCase()));
  return [...namesUsed(parsed.ast, new Set())]
    .filter((name) => !params.has(name) && name !== fn.name)
    .filter((name) => has(source, name) && !has(picked, name) && !has(here, name))
    .sort();
}
