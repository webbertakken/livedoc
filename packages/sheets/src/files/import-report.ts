// The import report (docs/specs/029-sheets/files-and-print.md "The import report", D120): a file's losses as the
// person reads them, one line a kind in a fixed order, each counted and naming up to three sheets, cells, codes or
// parts. Kept content of every kind is one line; a dropped entry is said by what it was; a thumbnail is not a loss.
import { droppedEntryKind } from '@livedoc/office-packages';
import { columnLetters } from '../address';
import { sheetPrefix } from './a1-text';
import type { FileLoss } from './workbook-file';

/** The most names a line shows (D120, as D88's). */
export const REPORT_NAMES_SHOWN = 3;

/** A line of the report, in the order the spec lists them. */
export const REPORTED_KINDS = [
  'sheets_cut',
  'sheet_unread',
  'sheet_cut',
  'cells_cut',
  'formula_unread',
  'name_unread',
  'function_unread',
  'formula_unwritten',
  'text_cut',
  'macros',
  'signature',
  'objects',
  'kept',
  'answers_differ',
  'format_unread',
  'format_unwritten',
  'format_approximated',
  'formats_cut',
  'styles_unread',
  'format_rule_unread',
  'validation_rule_unread',
  'protection_cut',
  'sizes_cut',
  'charts_unwritten',
  'chart_rewritten',
  'chart_nearest_type',
  'sheet_renamed',
] as const;

export type ReportedKind = (typeof REPORTED_KINDS)[number];

export type SheetRename = { from: string; to: string };

/** One line: how many, and the first names (unique, at most REPORT_NAMES_SHOWN). */
export type ReportedLoss =
  | { k: 'sheet_renamed'; count: number; names: SheetRename[] }
  | { k: Exclude<ReportedKind, 'sheet_renamed'>; count: number; names: string[] };

type Tally = { count: number; names: (string | SheetRename)[]; seen: Set<string> };

const cellName = (sheet: string, r: number, c: number) =>
  `${sheetPrefix(sheet)}${columnLetters(c)}${r + 1}`;

// What a loss adds to its line: its kind, how many, and its name (none for a count alone).
type Entry = [ReportedKind, number, ...(string | SheetRename)[]];

function entriesOf(loss: FileLoss): Entry[] {
  switch (loss.k) {
    case 'formula_unread':
    case 'formula_unwritten':
    case 'format_unread':
    case 'format_unwritten':
    case 'format_rule_unread':
    case 'validation_rule_unread':
      return [[loss.k, 1, cellName(loss.sheet, loss.r, loss.c)]];
    // The other app's change is read as it left it: logged with the read's losses, never reported (D294).
    case 'validation_rule_changed':
    case 'protection_changed':
    // A protection the grid cannot hold: logged with the read's losses; its cells stay as the sheet's others.
    case 'protection_unread':
      return [];
    case 'sheet_cut':
    case 'cells_cut':
    case 'sheet_unread':
    case 'formats_cut':
    case 'styles_unread':
    case 'sizes_cut':
    case 'protection_cut':
    case 'charts_unwritten':
    case 'chart_rewritten':
    case 'chart_nearest_type':
      return [[loss.k, 1, loss.sheet]];
    case 'sheets_cut':
      return [['sheets_cut', loss.had - loss.kept]];
    case 'function_unread':
    case 'name_unread':
      return [[loss.k, 1, loss.name]];
    // What a write leaves out of a named function or range: logged with the write's losses, never a read's.
    case 'function_unwritten':
    case 'function_cut':
    case 'name_unwritten':
      return [];
    case 'sheet_renamed':
      return [['sheet_renamed', 1, { from: loss.from, to: loss.to }]];
    case 'text_cut':
      return [['text_cut', loss.cells, loss.sheet]];
    case 'format_approximated':
      return [['format_approximated', 1, loss.code]];
    case 'kept_cut':
      return [['kept', loss.cells]];
    case 'kept_unread':
    case 'kept_dropped':
    case 'kept_too_large':
    case 'parts_left':
      return [['kept', loss.count]];
    case 'answers_differ':
      return [['answers_differ', loss.count, ...loss.functions.slice(0, REPORT_NAMES_SHOWN)]];
    case 'entries_dropped':
      return loss.entries.flatMap((entry): Entry[] => {
        const kind = droppedEntryKind(entry);
        // A preview picture shows nothing in the sheet, and LiveDoc's files carry none.
        if (kind === 'thumbnail') return [];
        return [[kind === 'object' ? 'objects' : kind, 1, entry]];
      });
  }
}

const keyOf = (name: string | SheetRename) =>
  typeof name === 'string' ? name : `${name.from}\u0000${name.to}`;

/** The report of a file's losses: a line a kind that has any, in REPORTED_KINDS' order. */
export function importReport(losses: readonly FileLoss[]): ReportedLoss[] {
  const tallies = new Map<ReportedKind, Tally>();
  for (const loss of losses)
    for (const [kind, count, ...names] of entriesOf(loss)) {
      const tally = tallies.get(kind) ?? { count: 0, names: [], seen: new Set<string>() };
      tallies.set(kind, tally);
      tally.count += count;
      for (const name of names) {
        if (tally.seen.has(keyOf(name))) continue;
        tally.seen.add(keyOf(name));
        if (tally.names.length < REPORT_NAMES_SHOWN) tally.names.push(name);
      }
    }
  return REPORTED_KINDS.flatMap((k): ReportedLoss[] => {
    const tally = tallies.get(k);
    if (!tally || tally.count === 0) return [];
    const { count, names } = tally;
    return [
      k === 'sheet_renamed'
        ? { k, count, names: names.filter((n): n is SheetRename => typeof n !== 'string') }
        : { k, count, names: names.filter((n): n is string => typeof n === 'string') },
    ];
  });
}
