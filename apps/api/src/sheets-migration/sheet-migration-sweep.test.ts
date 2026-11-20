import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import type { SheetMigrationDry } from './sheet-migration-dry';
import {
  SHEET_DRY_BATCH,
  SHEET_DRY_RETRY_MS,
  sweepSheetMigrationDry,
} from './sheet-migration-sweep';

// docs/specs/029-sheets/migration.md "How it runs": off unless SHEETS_MIGRATION is `dry`; then documents not planned
// yet, oldest first, at most SHEET_DRY_BATCH a run, each written to D1 as counts; a failure named and tried again
// after an hour; nothing to do, nothing asked.

const NOW = 1_700_000_000_000;
const planned: SheetMigrationDry = {
  kind: 'in-place',
  counts: { tabs: 2, sheets: 3, cells: 40, cardTables: 1, charts: 1 },
  tabsRemoved: 0,
  sheetsLeft: 1,
};

function setup(mode: string | undefined, answer: (id: string) => Promise<SheetMigrationDry>) {
  const d1 = sqliteD1({}, { keepD1Content: true });
  const asked: { id: string; name: string }[] = [];
  const env = {
    ...d1.env,
    SHEETS_MIGRATION: mode,
    DOCUMENT_ROOM: {
      idFromName: (id: string) => id,
      get: (id: string) => ({
        sheetMigrationDry: async (_doc: string, name: string) => {
          asked.push({ id, name });
          return answer(id);
        },
      }),
    },
  } as unknown as Env;
  const add = (id: string, createdAt: number) =>
    d1.sql
      .prepare(
        'INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES (?, ?, ?, 1, ?)',
      )
      .run(id, 'o', `Doc ${id}`, createdAt);
  const rows = () =>
    d1.sql.prepare('SELECT * FROM sheet_migration_plans ORDER BY document_id').all() as Record<
      string,
      unknown
    >[];
  return { env, asked, add, rows, sql: d1.sql };
}

describe('sweepSheetMigrationDry', () => {
  it.each([[undefined], ['off'], ['run']])('asks no room while the switch is %s', async (mode) => {
    const s = setup(mode, async () => planned);
    s.add('a', 1);
    expect(await sweepSheetMigrationDry(s.env, NOW)).toEqual({ found: 0, planned: 0, failed: 0 });
    expect(s.asked).toEqual([]);
    expect(s.rows()).toEqual([]);
  });

  it('plans each document once, with its name, and writes its counts', async () => {
    const s = setup('dry', async () => planned);
    s.add('b', 2);
    s.add('a', 1);
    expect(await sweepSheetMigrationDry(s.env, NOW)).toEqual({ found: 2, planned: 2, failed: 0 });
    expect(s.asked).toEqual([
      { id: 'a', name: 'Doc a' },
      { id: 'b', name: 'Doc b' },
    ]);
    expect(s.rows()[0]).toMatchObject({
      document_id: 'a',
      kind: 'in-place',
      tabs: 2,
      sheets: 3,
      cells: 40,
      card_tables: 1,
      charts: 1,
      tabs_removed: 0,
      sheets_left: 1,
      planned_at: NOW,
      error: null,
    });
    expect(await sweepSheetMigrationDry(s.env, NOW + 1)).toEqual({
      found: 0,
      planned: 0,
      failed: 0,
    });
  });

  it(`plans at most ${SHEET_DRY_BATCH} a run`, async () => {
    const s = setup('dry', async () => planned);
    for (let i = 0; i < SHEET_DRY_BATCH + 3; i++) s.add(`d${String(i).padStart(3, '0')}`, i);
    expect((await sweepSheetMigrationDry(s.env, NOW)).found).toBe(SHEET_DRY_BATCH);
    expect((await sweepSheetMigrationDry(s.env, NOW)).found).toBe(3);
  });

  it('names a failure, and tries it again only after an hour', async () => {
    let fail = true;
    const s = setup('dry', async () => {
      if (fail) throw new TypeError('room gone');
      return planned;
    });
    s.add('a', 1);
    expect(await sweepSheetMigrationDry(s.env, NOW)).toEqual({ found: 1, planned: 0, failed: 1 });
    expect(s.rows()[0]).toMatchObject({ kind: 'failed', error: 'TypeError', tabs: 0 });
    fail = false;
    expect((await sweepSheetMigrationDry(s.env, NOW + SHEET_DRY_RETRY_MS - 1)).found).toBe(0);
    expect(await sweepSheetMigrationDry(s.env, NOW + SHEET_DRY_RETRY_MS + 1)).toEqual({
      found: 1,
      planned: 1,
      failed: 0,
    });
    expect(s.rows()[0]).toMatchObject({ kind: 'in-place', error: null });
  });
});
