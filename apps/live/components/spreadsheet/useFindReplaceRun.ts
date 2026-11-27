'use client';

// What Find and Replace's buttons run (docs/specs/029-sheets/data-tools.md "Find and replace"): Find goes to the next
// match, across sheets as the sheet bar orders them (D457); Replace replaces the match it is on and goes on; Replace
// All replaces every match the search reaches as one change across sheets (D455, D458).
import { useMemo } from 'react';
import {
  findNext,
  findPattern,
  findPlaceFromText,
  findPlaceText,
  replaceMatches,
  type FindPattern,
  type FindPlace,
  type GridRange,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { useSheetNavigation } from '@/components/sheets/sheet-navigation';
import { useSheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  FIND_LOOPED,
  FIND_RANGE_UNREAD,
  FIND_REGEX_REFUSED,
  findNoResults,
  findReplacedLine,
} from '@/lib/spreadsheet/find-replace-words';
import type { FindReplaceState } from './find-replace-state';

export type FindReplaceRun = {
  // Why the search cannot run (a pattern RE2 refuses, a range it cannot read), or null.
  problem: string | null;
  // The selection as Specific Range shows it until typed over.
  selectionText: string;
  find: () => void;
  replace: () => void;
  replaceAll: () => void;
};

export function useFindReplaceRun(state: FindReplaceState): FindReplaceRun {
  const c = useSheetController();
  const actions = useSheetActions();
  const openSheetAt = useSheetNavigation();
  const { fields } = state;
  const pattern = useMemo(() => findPattern(fields.find, fields.opts), [fields.find, fields.opts]);
  const sel = c.selection.ranges[c.selection.ranges.length - 1]!;
  const selectionText = findPlaceText(c.sheet.title, sel);
  const rangeText = fields.range ?? selectionText;
  // The sheets of the tabs given, in their order.
  const sheetsOf = (tabIds: readonly string[]): FindPlace[] => {
    const byTab = new Map(c.workbook.sheetList().map((s) => [s.tabId, s.id]));
    return tabIds.flatMap((t) => {
      const id = byTab.get(t);
      return id ? [{ sheetId: id }] : [];
    });
  };
  // Where the search looks: Find through the shown sheets, Replace All every one (hidden too, as Google's).
  const placesFor = (every: boolean): FindPlace[] | null => {
    if (fields.search === 'sheet') return [{ sheetId: c.sheet.id }];
    if (fields.search === 'range')
      return ((p) => (p ? [p] : null))(findPlaceFromText(c.workbook.ctxFor(c.sheet.id), rangeText));
    return sheetsOf(every ? state.allTabIds : state.shownTabIds);
  };
  const regexRefused = !!pattern && 'refused' in pattern;
  const problem = regexRefused
    ? FIND_REGEX_REFUSED
    : fields.search === 'range' && !placesFor(false)
      ? FIND_RANGE_UNREAD
      : null;
  const ready = (): FindPattern | null => {
    if (!pattern || 'refused' in pattern) {
      if (regexRefused) debugLog('[workbook] find refused', { reason: 'regex' });
      return null;
    }
    return pattern;
  };
  const go = (sheetId: string, r: number, col: number) => {
    const range: GridRange = { r1: r, c1: col, r2: r, c2: col };
    if (sheetId === c.sheet.id) actions.goTo(range);
    else openSheetAt?.(sheetId, range);
  };
  const find = () => {
    const p = ready();
    const places = placesFor(false);
    if (!p || !places) return;
    const { r, c: col } = c.selectionNow().active;
    const next = findNext(c.workbook, places, { sheetId: c.sheet.id, r, c: col }, p);
    if (!next) return state.settle(findNoResults(fields.find), null);
    state.settle(next.looped ? FIND_LOOPED : '', next);
    go(next.sheetId, next.r, next.c);
  };
  const rights = { formulas: c.canShape, caller: c.store.protection() };
  const replace = () => {
    const p = ready();
    const at = state.at;
    const { r, c: col } = c.selectionNow().active;
    // Replace acts on the match Find is on; anywhere else it finds first.
    if (!p || !at || at.sheetId !== c.sheet.id || at.r !== r || at.c !== col) return find();
    const one = replaceMatches(
      c.workbook,
      [{ sheetId: at.sheetId, within: { r1: r, c1: col, r2: r, c2: col } }],
      p,
      fields.by,
      rights,
    );
    if (one.edits.length && !c.writeAll(one.edits, 'Replace')) return;
    find();
  };
  const replaceAll = () => {
    const p = ready();
    const places = placesFor(true);
    if (!p || !places) return;
    const done = replaceMatches(c.workbook, places, p, fields.by, rights);
    debugLog('[workbook] find replaced', {
      instances: done.instances,
      cells: done.cells,
      sheets: done.sheets,
      protectedLeft: done.protectedLeft,
      regex: !!fields.opts.regex,
    });
    if (done.costly) debugLog('[workbook] find refused', { reason: 'costly', cells: done.costly });
    if (!done.instances)
      return state.settle(
        done.protectedLeft
          ? findReplacedLine(0, fields.find, fields.by, done.protectedLeft)
          : findNoResults(fields.find),
        null,
      );
    if (!c.writeAll(done.edits, 'Replace')) return;
    track('Spreadsheet', 'Changed', 'Replace');
    state.settle(
      findReplacedLine(done.instances, fields.find, fields.by, done.protectedLeft),
      null,
    );
  };
  return { problem, selectionText, find, replace, replaceAll };
}
