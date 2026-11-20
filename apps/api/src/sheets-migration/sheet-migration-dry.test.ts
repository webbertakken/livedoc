import { beforeEach, describe, expect, it } from 'vitest';
import { workbookKit, type WorkbookKit } from '../routes/workbook-test-kit';
import { sheetMigrationDry } from './sheet-migration-dry';

// docs/specs/029-sheets/migration.md "What it does", "How it runs": the room reads its document into the planner and
// answers what it would become, as counts, writing nothing.

let kit: WorkbookKit;

beforeEach(() => {
  kit = workbookKit();
});

const sheetElement = (sheetId: string) => ({
  id: `el-${sheetId}`,
  type: 'shape',
  shape: 'plan-sheet',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  planSheet: { sheetId },
});

describe('sheetMigrationDry', () => {
  it('counts a document of Sheet tabs as one becoming a spreadsheet in place', async () => {
    const doc = kit.document('plan1', false, [
      { r: kit.layout.rows[0]!, c: kit.layout.cols[0]!, i: { n: 1 } },
    ]);
    (doc.tabs as { elements: unknown[] }[])[0]!.elements = [sheetElement('plan1Sheet')];
    expect((await kit.call({ path: '', body: doc })).status).toBe(201);
    const before = kit.sql.sql.prepare('SELECT COUNT(*) AS n FROM tabs').get();
    expect(await sheetMigrationDry(kit.sql.env, 'plan1', 'Budget')).toEqual({
      kind: 'in-place',
      counts: { tabs: 1, sheets: 1, cells: 1, cardTables: 0, charts: 0 },
      tabsRemoved: 0,
      sheetsLeft: 0,
    });
    expect(kit.sql.sql.prepare('SELECT COUNT(*) AS n FROM tabs').get()).toEqual(before);
  });

  it('counts a spreadsheet as nothing to move', async () => {
    expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
    expect((await sheetMigrationDry(kit.sql.env, 'book1', 'Book')).kind).toBe('none');
  });

  it('counts a document with no Sheet as nothing to move', async () => {
    const doc = {
      id: 'plain',
      name: 'Plain',
      tabs: [{ id: 'plaint', name: 'Tab 1', elements: [] }],
    };
    expect((await kit.call({ path: '', body: doc })).status).toBe(201);
    expect(await sheetMigrationDry(kit.sql.env, 'plain', 'Plain')).toMatchObject({
      kind: 'none',
      tabsRemoved: 0,
    });
  });
});
