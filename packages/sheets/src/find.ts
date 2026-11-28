// Find and Replace (docs/specs/029-sheets/data-tools.md "Find and replace", sheet.md "Find"), as Google's findReplace
// answers (D455-D459): Find looks in what cells show (and, asked, in formulas' text and links' addresses), row by row
// in the layout's order; Replace changes each cell's edit text, read again as typed, never a formula's result, and
// counts every match as Google counts them. Pure: the writes are returned, one per sheet, for one change.
import { displayValue } from './number-format';
import { layoutIndex } from './layout';
import { splitCellKey, type Cell, type CellInput } from './sheet';
import { escapeRegExp } from './input';
import { readTypedInput } from './typed-input';
import { cellEditText } from './edit-text';
import { re2 } from './formula/functions/text-patterns';
import { applyReplacement, type ReplacementPart } from './formula/re2/re2-replace';
import { Protection, protectionsAt, type ProtectionCaller } from './protection';
import type { CellChange, SheetWrite } from './store';
import type { Workbook } from './engine/workbook';
import { formatRange, parseRangeText, type CellPos, type GridRange } from './address';
import { quoteSheet, type SheetsCtx } from './formula/stored';
import { splitSheetText } from './rules/rule-source';

export type FindOptions = {
  matchCase?: boolean;
  entireCell?: boolean;
  regex?: boolean;
  inFormulas?: boolean;
  inLinks?: boolean;
};

/** A sheet to search, or a range of it (Specific Range). */
export type FindPlace = { sheetId: string; within?: GridRange };

/** A search ready to run: whether a text matches, and the text with its matches replaced, or null when a regular
 *  expression would cost too much on that text (formulas' bound). */
export type FindPattern = {
  readonly opts: FindOptions;
  test(text: string): boolean | null;
  replace(text: string, by: string): { text: string; count: number } | null;
};

/** Why a search cannot run. */
export type FindRefusal = { refused: 'regex' };

/** Who replaces: whether they may change formulas' text, and who they are to the sheets' protections. */
export type ReplaceRights = { formulas: boolean; caller: ProtectionCaller | null };

export type ReplaceResult = {
  edits: { sheetId: string; write: SheetWrite }[];
  // Matches replaced, cells and sheets changed, as Google counts them.
  instances: number;
  cells: number;
  sheets: number;
  // Cells matched but kept: under a protection that does not admit the caller (D458); too costly to search.
  protectedLeft: number;
  costly: number;
};

// Replace With under a regular expression, as Google's (D456): `$0` the match, `$1` on its groups (the longest
// number naming one), `$$` a dollar sign; a backslash and any other `$` plain text.
function replacementParts(by: string, groups: number): ReplacementPart[] {
  const parts: ReplacementPart[] = [];
  let plain = '';
  for (let i = 0; i < by.length; i++) {
    const ch = by[i]!;
    const first = by.charCodeAt(i + 1) - 48;
    if (ch === '$' && by[i + 1] === '$') {
      plain += '$';
      i++;
    } else if (ch === '$' && first >= 0 && first <= groups) {
      let n = first;
      i++;
      for (
        let next = by.charCodeAt(i + 1) - 48;
        next >= 0 && next <= 9 && n * 10 + next <= groups;
      ) {
        n = n * 10 + next;
        i++;
        next = by.charCodeAt(i + 1) - 48;
      }
      if (plain) parts.push(plain);
      plain = '';
      parts.push(n);
    } else plain += ch;
  }
  if (plain) parts.push(plain);
  return parts;
}

// Matches of `re` (with `groups` capture groups) in `text` replaced, and how many there were.
function replaced(
  re: RegExp,
  groups: number,
  text: string,
  by: (m: (string | undefined)[]) => string,
) {
  let count = 0;
  const out = text.replace(re, (...args: unknown[]) => {
    count++;
    return by(args.slice(0, groups + 1) as (string | undefined)[]);
  });
  return { text: out, count };
}

/** The search for `query` under `opts`, null for an empty one, refused for a pattern RE2 refuses. */
export function findPattern(query: string, opts: FindOptions): FindPattern | FindRefusal | null {
  if (query === '') return null;
  if (!opts.regex) {
    const q = opts.matchCase ? query : query.toLowerCase();
    const re = new RegExp(escapeRegExp(query), opts.matchCase ? 'gu' : 'giu');
    const whole = (text: string) => (opts.matchCase ? text : text.toLowerCase()) === q;
    return {
      opts,
      test: (text) =>
        opts.entireCell ? whole(text) : (opts.matchCase ? text : text.toLowerCase()).includes(q),
      replace: (text, by) =>
        opts.entireCell
          ? whole(text)
            ? { text: by, count: 1 }
            : { text, count: 0 }
          : replaced(re, 0, text, () => by),
    };
  }
  const source = `${opts.matchCase ? '' : '(?i)'}${opts.entireCell ? `^(?:${query})$` : query}`;
  const compiled = re2('Find', source, '', true);
  if ('e' in compiled) return { refused: 'regex' };
  const parts = (by: string) => replacementParts(by, compiled.groups);
  const on = (text: string) => {
    const r = re2('Find', source, text, true);
    return 'e' in r ? null : r.re;
  };
  return {
    opts,
    test: (text) => {
      const re = on(text);
      return re ? re.test(text) : null;
    },
    replace: (text, by) => {
      const re = on(text);
      if (!re) return null;
      const p = parts(by);
      return replaced(re, compiled.groups, text, (m) => applyReplacement(p, m));
    },
  };
}

const inside = (within: GridRange | undefined, r: number, c: number) =>
  !within || (r >= within.r1 && r <= within.r2 && c >= within.c1 && c <= within.c2);

// The place's filled cells with their positions, row by row.
function placedCells(wb: Workbook, place: FindPlace) {
  const sheet = wb.sheet(place.sheetId);
  if (!sheet) return [];
  const ix = layoutIndex(sheet.layout);
  const out: { key: string; cell: Cell & { input: CellInput }; r: number; c: number }[] = [];
  for (const [key, cell] of sheet.cells) {
    if (!cell.input) continue;
    const { r: rowId, c: colId } = splitCellKey(key);
    const r = ix.rowPos.get(rowId);
    const c = ix.colPos.get(colId);
    if (r === undefined || c === undefined || !inside(place.within, r, c)) continue;
    out.push({ key, cell: cell as Cell & { input: CellInput }, r, c });
  }
  return out.sort((a, b) => a.r - b.r || a.c - b.c);
}

/** The cells of `place` the search matches, row by row: what they show, and as asked formulas' text and links. */
export function findMatches(wb: Workbook, place: FindPlace, pattern: FindPattern): CellPos[] {
  const sheet = wb.sheet(place.sheetId);
  if (!sheet) return [];
  const ctx = wb.ctxFor(place.sheetId);
  const { opts } = pattern;
  const out: CellPos[] = [];
  for (const { cell, r, c } of placedCells(wb, place)) {
    const shown = displayValue(wb.value(place.sheetId, r, c), cell.format, wb.locale).text;
    const formula = opts.inFormulas && 'f' in cell.input;
    const link = opts.inLinks ? wb.hyperlinkOf(place.sheetId, r, c) : null;
    if (
      pattern.test(shown) ||
      (formula && pattern.test(cellEditText(cell, ctx, wb.locale))) ||
      (link !== null && pattern.test(link))
    )
      out.push({ r, c });
  }
  return out;
}

/** Every match in `places` replaced by `by` in the cells' edit text, as one write a sheet, with Google's counts. */
export function replaceMatches(
  wb: Workbook,
  places: readonly FindPlace[],
  pattern: FindPattern,
  by: string,
  rights: ReplaceRights,
): ReplaceResult {
  const result: ReplaceResult = {
    edits: [],
    instances: 0,
    cells: 0,
    sheets: 0,
    protectedLeft: 0,
    costly: 0,
  };
  for (const place of places) {
    const sheet = wb.sheet(place.sheetId);
    if (!sheet) continue;
    const ctx = wb.ctxFor(place.sheetId);
    const cells: CellChange[] = [];
    for (const { key, cell, r, c } of placedCells(wb, place)) {
      // A picture has no text to replace (inserted-objects.md "Images in a cell", D631).
      if ('img' in cell.input) continue;
      const isFormula = 'f' in cell.input;
      // A formula's text only with Also Search Within Formulas, and only by someone who may change it.
      if (isFormula && !(pattern.opts.inFormulas && rights.formulas)) continue;
      const typed = cellEditText(cell, ctx, wb.locale);
      const next = pattern.replace(typed, by);
      if (!next) {
        result.costly++;
        continue;
      }
      if (next.count === 0 || next.text === typed) continue;
      const caller = rights.caller;
      if (caller && protectionsAt(sheet.layout, r, c).some((p) => !Protection.admits(p, caller))) {
        result.protectedLeft++;
        continue;
      }
      const read = readTypedInput(
        next.text,
        wb.locale,
        ctx,
        cell.format?.nf === 'text' && !isFormula,
      );
      if (read.kind === 'invalid') continue;
      const ids = splitCellKey(key);
      cells.push({ r: ids.r, c: ids.c, i: read.kind === 'clear' ? null : read.input });
      result.instances += next.count;
    }
    if (!cells.length) continue;
    result.edits.push({ sheetId: place.sheetId, write: { kind: 'cells', cells } });
    result.cells += cells.length;
    result.sheets++;
  }
  return result;
}

/** A found match: its sheet and cell, and whether Find went past the end and began again to reach it. */
export type FoundMatch = { sheetId: string; r: number; c: number; looped: boolean };

/**
 * The next match after `from` (D457): row by row on its sheet, then each following place of `places` (the sheet bar's
 * order), past the last back to the first and round to `from` itself; null when nothing matches.
 */
export function findNext(
  wb: Workbook,
  places: readonly FindPlace[],
  from: { sheetId: string; r: number; c: number },
  pattern: FindPattern,
): FoundMatch | null {
  const start = places.findIndex((p) => p.sheetId === from.sheetId);
  // From a sheet the search does not reach: the first match in it.
  if (start < 0) {
    for (const place of places) {
      const m = findMatches(wb, place, pattern)[0];
      if (m) return { sheetId: place.sheetId, ...m, looped: false };
    }
    return null;
  }
  const after = (m: CellPos) => m.r > from.r || (m.r === from.r && m.c > from.c);
  const first = findMatches(wb, places[start]!, pattern);
  const next = first.find(after);
  if (next) return { sheetId: from.sheetId, ...next, looped: false };
  for (let k = 1; k <= places.length; k++) {
    const i = (start + k) % places.length;
    const place = places[i]!;
    // Back on the starting sheet, its first match is at or before `from`.
    const m = (i === start ? first : findMatches(wb, place, pattern))[0];
    if (m) return { sheetId: place.sheetId, ...m, looped: start + k >= places.length };
  }
  return null;
}

/** A Specific Range as typed (`Sheet2!A1:D10`, or `A1:D10` on `ctx`'s sheet), or null when it cannot be read. */
export function findPlaceFromText(ctx: SheetsCtx, text: string): FindPlace | null {
  const { title, range } = splitSheetText(text);
  const sheet = title === null ? ctx.own : ctx.byTitle(title);
  const within = sheet ? parseRangeText(range) : null;
  return sheet && within ? { sheetId: sheet.id, within } : null;
}

/** A Specific Range as the field shows it: `Sheet1!A1:D10`. */
export function findPlaceText(title: string, range: GridRange): string {
  return `${quoteSheet(title)}!${formatRange(range)}`;
}
