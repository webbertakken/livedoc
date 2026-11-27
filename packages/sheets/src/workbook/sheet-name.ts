// A sheet's name in a spreadsheet (docs/specs/029-sheets/spreadsheet.md "What a workbook holds"): it is the sheet
// tab's name, 1 to 100 characters, unique in the workbook case aside, never ' at either end, none of [ ] * ? / \ :
// (the characters a reference or a file cannot carry in a sheet's name).

export const SHEET_NAME_MAX = 100;

// The characters a sheet's name never holds.
const FORBIDDEN = /[[\]*?/\\:]/u;
const FORBIDDEN_ALL = /[[\]*?/\\:]/gu;

export type SheetNameRefusal = 'sheet_name_invalid' | 'sheet_name_taken';
export type SheetNameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly refusal: SheetNameRefusal };

const lengthOf = (name: string): number => [...name].length;

const isTaken = (name: string, taken: readonly string[]): boolean => {
  const lower = name.toLowerCase();
  return taken.some((t) => t.toLowerCase() === lower);
};

function check(raw: string, taken: readonly string[]): SheetNameCheck {
  const name = raw.trim();
  if (
    name === '' ||
    lengthOf(name) > SHEET_NAME_MAX ||
    FORBIDDEN.test(name) ||
    name.startsWith("'") ||
    name.endsWith("'")
  )
    return { ok: false, refusal: 'sheet_name_invalid' };
  if (isTaken(name, taken)) return { ok: false, refusal: 'sheet_name_taken' };
  return { ok: true, name };
}

const cut = (name: string, max: number): string => [...name].slice(0, max).join('').trimEnd();

// The next free "SheetN", as Google Sheets names a new sheet.
function nextFree(taken: readonly string[]): string {
  for (let n = 1; ; n++) if (!isTaken(`Sheet${n}`, taken)) return `Sheet${n}`;
}

// The name without apostrophes at either end, in one linear pass (a file's name is untrusted: no backtracking).
function withoutEndQuotes(name: string): string {
  let start = 0;
  let end = name.length;
  while (start < end && name[start] === "'") start++;
  while (end > start && name[end - 1] === "'") end--;
  return name.slice(start, end);
}

/** A new sheet's name, as Google Sheets gives one: `Sheet<n>`, n the first from the sheets' count plus one not taken. */
function next(taken: readonly string[]): string {
  for (let n = taken.length + 1; ; n++) if (!isTaken(`Sheet${n}`, taken)) return `Sheet${n}`;
}

/** A name that keeps the rules, made from one that may not (a file's, a copy's): mended, cut, numbered if taken. */
function fit(raw: string, taken: readonly string[]): string {
  const mended = raw.replace(FORBIDDEN_ALL, ' ').replace(/\s+/gu, ' ').trim();
  // Cut, then mended again: a cut may leave an apostrophe or a space at the end.
  const base = withoutEndQuotes(cut(withoutEndQuotes(mended).trim(), SHEET_NAME_MAX)).trim();
  if (base === '') return nextFree(taken);
  if (!isTaken(base, taken)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const name = `${cut(base, SHEET_NAME_MAX - suffix.length)}${suffix}`;
    if (!isTaken(name, taken)) return name;
  }
}

/** `<base><gap><n>`, n the first from one not taken (`Pivot Table 1`, `Details1`: pivot-tables.md "Making one", "Details"). */
function numbered(base: string, taken: readonly string[], gap = ' '): string {
  for (let n = 1; ; n++) if (!isTaken(`${base}${gap}${n}`, taken)) return `${base}${gap}${n}`;
}

export const SheetName = { check, fit, next, numbered } as const;
