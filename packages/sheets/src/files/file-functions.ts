// Named functions in a file (docs/specs/029-sheets/standard-mapping.md "Named functions in the file", D340 to D342):
// XLSX holds each as a workbook's named `LAMBDA`, its description the defined name's `comment`; ODF holds none.
// Read, a `LAMBDA` name LiveDoc cannot hold goes back to the kept content, as it came.
import {
  attributeOf,
  escapeXmlAttribute,
  escapeXmlText,
  textContent,
} from '@livedoc/office-packages';
import type { XmlElement } from '@livedoc/office-packages';
import { compileFormula, type SheetsCtx } from '../formula/stored';
import { parseFormula } from '../formula/parse';
import { tokenize } from '../formula/tokens';
import { definitionFormula, withDefinition } from '../named-function-refs';
import { NAMED_FUNCTIONS_MAX, NamedFunction, namedFunctionProblem } from '../named-functions';
import {
  dummyFunction,
  fromExcelFormula,
  toExcelFormula,
  unwrapDummyFunction,
} from './excel-formula';
import type { FileAt, KeptItem } from './kept-content';
import { excelRefuses } from './file-names';
import type { FileLoss } from './workbook-file';
import { XLSX_FORMULA_MAX } from './xlsx-bounds';
import { XLSX_FUTURE_PREFIX, XLSX_PARAMETER_PREFIX } from './xlsx-function-names';

/**
 * A named function as a file holds it: its definition `=` first in Google's syntax, each reference with its sheet.
 * `hinted`: the model's argument help, which no file holds. `kept`: read, the defined name as it came.
 */
export type FileFunction = {
  name: string;
  params: string[];
  body: string;
  description?: string;
  hinted?: true;
  kept?: KeptItem<FileAt>;
};

/** The most characters Excel keeps in a defined name's comment (Excel's Name Manager). */
export const EXCEL_NAME_COMMENT_MAX = 255;


/** The workbook's named functions as a file holds them, each definition written against `ctx`'s sheets. */
export function fileFunctionsOf(list: readonly NamedFunction[], ctx: SheetsCtx): FileFunction[] {
  return list.map((fn) => ({
    name: fn.name,
    params: [...fn.params],
    body: definitionFormula(fn, ctx),
    ...(fn.description ? { description: fn.description } : {}),
    ...(fn.hints?.some((h) => h !== null) ? { hinted: true as const } : {}),
  }));
}

/** What a named function's defined name holds: `_xlfn.LAMBDA(...)`, its definition wrapped by S5 when Excel cannot hold it. */
export function excelLambda(fn: FileFunction, renamed: ReadonlyMap<string, string>): string {
  const own = fn.body.replace(/^=/, '');
  const native = toExcelFormula(`=LAMBDA(${[...fn.params, own].join(',')})`, renamed);
  if (native !== null) return native;
  const params = fn.params.map((p) => `${XLSX_PARAMETER_PREFIX}${p}`);
  return `${XLSX_FUTURE_PREFIX}LAMBDA(${[...params, dummyFunction(fn.body, '')].join(',')})`;
}

/**
 * The named functions' defined names, as `definedName` XML, and the names they take (upper case); what Excel cannot
 * hold of each is named in `losses` (D340), and so is one a named range already takes (`reserved`, D344).
 */
export function xlsxFunctionNames(
  functions: readonly FileFunction[] | undefined,
  renamed: ReadonlyMap<string, string>,
  losses: FileLoss[],
  reserved: ReadonlySet<string> = new Set(),
): { names: string[]; taken: Set<string> } {
  const names: string[] = [];
  const taken = new Set<string>();
  for (const fn of functions ?? []) {
    const lambda = excelLambda(fn, renamed);
    if (
      excelRefuses(fn.name) ||
      reserved.has(fn.name.toUpperCase()) ||
      lambda.length > XLSX_FORMULA_MAX
    ) {
      losses.push({ k: 'function_unwritten', name: fn.name });
      continue;
    }
    const description = fn.description ?? '';
    const comment = description.slice(0, EXCEL_NAME_COMMENT_MAX);
    if (fn.hinted || comment.length < description.length)
      losses.push({ k: 'function_cut', name: fn.name });
    const attribute = comment ? ` comment="${escapeXmlAttribute(comment)}"` : '';
    names.push(
      `<definedName name="${escapeXmlAttribute(fn.name)}"${attribute}>${escapeXmlText(lambda)}</definedName>`,
    );
    taken.add(fn.name.toUpperCase());
  }
  return { names, taken };
}

// The definition after a LAMBDA's placeholders in `formula` (`=LAMBDA(x,y,body)`), or null when it is not one.
function lambdaParts(formula: string): { params: string[]; body: string } | null {
  const parsed = parseFormula(formula);
  if (!parsed.ok || parsed.ast.k !== 'call' || parsed.ast.name !== 'LAMBDA') return null;
  const args = parsed.ast.args;
  if (args.length < 1) return null;
  const count = args.length - 1;
  if (!args.at(-1) || args.slice(0, -1).some((arg) => arg?.k !== 'name')) return null;
  // The placeholders as written (the parser reads names in capitals), and the definition: the text after the last
  // placeholder's comma, to the LAMBDA's closing bracket.
  const params: string[] = [];
  const tokens = tokenize(formula.slice(1), 1);
  let depth = 0;
  let from = -1;
  for (const tok of tokens) {
    if (tok.k === 'lparen' && ++depth === 1 && count === 0) from = tok.end;
    else if (tok.k === 'rparen' && --depth === 0)
      return { params, body: formula.slice(from, tok.start).trim() };
    else if (tok.k === 'ident' && depth === 1 && params.length < count) params.push(tok.v);
    else if (tok.k === 'comma' && depth === 1 && params.length === count && from < 0)
      from = tok.end;
  }
  /* v8 ignore next -- a parsed call always closes its bracket */
  return null;
}

/**
 * A workbook's defined name as a named function, when its formula is a `LAMBDA` of placeholders and a definition;
 * else null. `kept` is the defined name as the file wrote it.
 */
export function readXlsxFunction(name: XmlElement, kept: KeptItem<FileAt>): FileFunction | null {
  const own = attributeOf(name, '', 'name');
  const formula = fromExcelFormula(textContent(name).trim());
  const parts = own && formula ? lambdaParts(formula) : null;
  if (!own || !parts) return null;
  const description = attributeOf(name, '', 'comment');
  return {
    name: own.toUpperCase(),
    params: parts.params,
    body: unwrapDummyFunction(parts.body) ?? `=${parts.body}`,
    ...(description ? { description } : {}),
    kept,
  };
}

/**
 * A file's named functions in the model, each definition read against `ctx`'s sheets (a reference naming none names
 * `ctx.own`). One the rules refuse, or past the most a spreadsheet holds, is `refused`: its file's own XML, to keep.
 */
export function functionsFromFile(
  functions: readonly FileFunction[] | undefined,
  ctx: SheetsCtx,
  losses: FileLoss[],
): { functions: NamedFunction[]; refused: KeptItem<FileAt>[] } {
  const made: NamedFunction[] = [];
  const refused: KeptItem<FileAt>[] = [];
  for (const fn of functions ?? []) {
    const compiled = compileFormula(fn.body, ctx);
    const named: NamedFunction = {
      name: fn.name,
      params: fn.params,
      body: fn.body,
      ...(fn.description ? { description: fn.description } : {}),
    };
    const read = compiled.ok ? withDefinition(named, compiled.formula, ctx.own.id) : named;
    if (!compiled.ok || made.length >= NAMED_FUNCTIONS_MAX || namedFunctionProblem(read, made)) {
      losses.push({ k: 'function_unread', name: fn.name });
      if (fn.kept) refused.push(fn.kept);
      continue;
    }
    made.push(read);
  }
  return { functions: NamedFunction.sorted(made), refused };
}
