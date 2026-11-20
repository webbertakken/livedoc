// A document's dry run of the Sheets migration (docs/specs/029-sheets/migration.md "How it runs"), inside its room:
// its tabs and stored sheets read into the planner's input, planned, and answered as counts. Writes nothing; never
// content in its answer or its log.
import {
  planSheetMigration,
  type MigrationInput,
  type MigrationTab,
  type SheetMigrationCounts,
} from '@livedoc/sheets';
import { listSheetHeads, tabBodiesInOrder } from '../db';
import { isSpreadsheet } from '../db/workbook';
import type { DocumentEnv } from '../types';

/** What a document would become: `none` (nothing to move, or a spreadsheet already), `in-place` or `split`. */
export type SheetMigrationDry = {
  kind: 'none' | 'in-place' | 'split';
  counts: SheetMigrationCounts;
  // Tabs that would go, and sheets nothing shows that would be left to expire.
  tabsRemoved: number;
  sheetsLeft: number;
};

// A document holds at most this many tabs to read in one dry run (its tab order is read in one query).
const DRY_TABS_MAX = 10_000;

const NONE: SheetMigrationDry = {
  kind: 'none',
  counts: { tabs: 0, sheets: 0, cells: 0, cardTables: 0, charts: 0 },
  tabsRemoved: 0,
  sheetsLeft: 0,
};

/** The planner's input as the room holds the document. */
export async function readMigrationInput(
  env: DocumentEnv,
  documentId: string,
  documentName: string,
): Promise<MigrationInput> {
  const [tabs, heads] = await Promise.all([
    tabBodiesInOrder(env, documentId, 0, DRY_TABS_MAX),
    listSheetHeads(env, documentId),
  ]);
  return {
    documentName,
    tabs: tabs.map((t): MigrationTab => ({
      id: t.id,
      name: t.name,
      ...(t.kind ? { kind: t.kind } : {}),
      elements: t.elements,
    })),
    sheets: heads.map((h) => ({
      id: h.id,
      tabId: h.tabId,
      title: h.title,
      cellCount: h.cellCount,
      cardTables: (h.layout.cardTables ?? []).map((ct) => ({
        id: ct.id,
        ...(ct.controls ? { controls: ct.controls } : {}),
      })),
      setupPending: h.layout.setupPending === true,
    })),
  };
}

export async function sheetMigrationDry(
  env: DocumentEnv,
  documentId: string,
  documentName: string,
): Promise<SheetMigrationDry> {
  // A spreadsheet is what the migration makes: nothing of it moves.
  if (await isSpreadsheet(env, documentId)) return NONE;
  const plan = planSheetMigration(await readMigrationInput(env, documentId, documentName));
  if (plan.kind === 'none') return NONE;
  return {
    kind: plan.kind,
    counts: plan.counts,
    tabsRemoved: plan.tabsRemoved.length,
    sheetsLeft: plan.sheetsLeft.length,
  };
}
