// What a document's stored Plan Sheets become (docs/specs/029-sheets/migration.md "What it does"), worked out without
// touching anything: the plan a dry run counts and a run carries out. Pure; the room reads the document into its input.
//
// - A document whose tabs are all Sheet tabs becomes a spreadsheet in place: each Sheet tab a sheet tab, same name and
//   order; other Sheets on a tab (copies, older Sheets) become sheet tabs after it, in element order.
// - A document mixing Sheet tabs with other tabs keeps the other tabs; its Sheet tabs, and Sheet elements on general
//   tabs, move to a new spreadsheet "<Document> Sheets". The Sheet tabs they leave go; a general tab keeps the rest.
// - A card table's links, drafts and Controls column go; its rows stay the plain cells they last showed. A sheet
//   waiting for its setup becomes an ordinary sheet.
// - A sheet no Sheet element shows only waits to expire: it is left as it is.
import { SheetName } from '../workbook/sheet-name';

/** An element as the plan reads it: a Sheet (`shape` `plan-sheet`) or a chart anchored in one. */
export type MigrationElement = {
  readonly id: string;
  readonly type: string;
  readonly shape?: string;
  readonly planSheet?: { readonly sheetId: string };
  readonly chartSource?: { readonly sheetId: string };
  readonly sheetAnchor?: unknown;
};

export type MigrationTab = {
  readonly id: string;
  readonly name: string;
  readonly kind?: string;
  readonly elements: readonly MigrationElement[];
};

export type MigrationSheet = {
  readonly id: string;
  readonly tabId: string;
  readonly title: string;
  readonly cellCount: number;
  readonly cardTables: readonly { readonly id: string; readonly controls?: string }[];
  readonly setupPending: boolean;
};

export type MigrationInput = {
  readonly documentName: string;
  // In tab order.
  readonly tabs: readonly MigrationTab[];
  readonly sheets: readonly MigrationSheet[];
};

/** One sheet as a sheet tab of the spreadsheet. `tabId` is the Sheet tab it keeps, or null for a new tab. */
export type MigratedSheet = {
  readonly sheetId: string;
  readonly name: string;
  readonly tabId: string | null;
  // The element that showed it, and the tab that element was on.
  readonly fromElement: string;
  readonly fromTab: string;
  // Card tables dropped, and the Controls columns that go with them.
  readonly cardTables: readonly string[];
  readonly controlCols: readonly string[];
  readonly setupDropped: boolean;
  // Charts anchored in it, by element id, to become charts of the workbook at the same place.
  readonly charts: readonly string[];
  readonly cells: number;
};

export type SheetMigrationPlan =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'in-place' | 'split';
      // The spreadsheet's name: the document's own in place, "<Document> Sheets" when split.
      readonly name: string;
      readonly sheets: readonly MigratedSheet[];
      // Tabs that go: Sheet tabs left empty, or (split) every Sheet tab.
      readonly tabsRemoved: readonly string[];
      // Elements that leave a tab that stays (split): Sheets and the charts anchored in them.
      readonly elementsRemoved: readonly {
        readonly tabId: string;
        readonly ids: readonly string[];
      }[];
      // Sheets no Sheet element shows, left to expire.
      readonly sheetsLeft: readonly string[];
      readonly counts: SheetMigrationCounts;
    };

export type SheetMigrationCounts = {
  // The tabs the sheets come from.
  readonly tabs: number;
  readonly sheets: number;
  readonly cells: number;
  readonly cardTables: number;
  readonly charts: number;
};

const SHEET_TAB = 'sheet';
// The suffix a split spreadsheet's name takes (migration.md "What it does").
export const SPLIT_NAME_SUFFIX = ' Sheets';

const isSheetElement = (el: MigrationElement): boolean =>
  el.type === 'shape' && el.shape === 'plan-sheet' && typeof el.planSheet?.sheetId === 'string';

const isAnchoredChart = (el: MigrationElement): boolean =>
  el.type === 'shape' && !!el.chartSource && !!el.sheetAnchor;

export function planSheetMigration(input: MigrationInput): SheetMigrationPlan {
  const sheetsById = new Map(input.sheets.map((s) => [s.id, s]));
  const inPlace = input.tabs.length > 0 && input.tabs.every((t) => t.kind === SHEET_TAB);
  const taken: string[] = [];
  const shown = new Set<string>();
  const sheets: MigratedSheet[] = [];
  const tabsRemoved: string[] = [];
  const elementsRemoved: { tabId: string; ids: string[] }[] = [];
  for (const tab of input.tabs) {
    const isSheetTab = tab.kind === SHEET_TAB;
    const removed: string[] = [];
    let keptTab = false;
    for (const el of tab.elements) {
      if (!isSheetElement(el)) continue;
      const sheet = sheetsById.get(el.planSheet!.sheetId);
      // A Sheet whose sheet is gone, or shown twice (a pasted element): nothing more to move.
      if (!sheet || shown.has(sheet.id)) continue;
      shown.add(sheet.id);
      // In place, a Sheet tab's first Sheet keeps the tab and its name; every other Sheet takes a tab of its own.
      const keeps = inPlace && isSheetTab && !keptTab;
      if (keeps) keptTab = true;
      const name = SheetName.fit(keeps ? tab.name : sheet.title, taken);
      taken.push(name);
      const charts = tab.elements
        .filter((c) => isAnchoredChart(c) && c.chartSource!.sheetId === sheet.id)
        .map((c) => c.id);
      if (!isSheetTab) removed.push(el.id, ...charts);
      sheets.push({
        sheetId: sheet.id,
        name,
        tabId: keeps ? tab.id : null,
        fromElement: el.id,
        fromTab: tab.id,
        cardTables: sheet.cardTables.map((t) => t.id),
        controlCols: sheet.cardTables.flatMap((t) => (t.controls ? [t.controls] : [])),
        setupDropped: sheet.setupPending,
        charts,
        cells: sheet.cellCount,
      });
    }
    // A Sheet tab goes when it leaves for another spreadsheet, or holds no Sheet to keep it.
    if (isSheetTab && !keptTab) tabsRemoved.push(tab.id);
    if (removed.length > 0) elementsRemoved.push({ tabId: tab.id, ids: removed });
  }
  if (sheets.length === 0) return { kind: 'none' };
  return {
    kind: inPlace ? 'in-place' : 'split',
    name: inPlace ? input.documentName : `${input.documentName}${SPLIT_NAME_SUFFIX}`,
    sheets,
    tabsRemoved,
    elementsRemoved,
    sheetsLeft: input.sheets.filter((s) => !shown.has(s.id)).map((s) => s.id),
    counts: {
      tabs: new Set(sheets.map((s) => s.fromTab)).size,
      sheets: sheets.length,
      cells: sheets.reduce((n, s) => n + s.cells, 0),
      cardTables: sheets.reduce((n, s) => n + s.cardTables.length, 0),
      charts: sheets.reduce((n, s) => n + s.charts.length, 0),
    },
  };
}
