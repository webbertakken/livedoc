import { describe, expect, it } from 'vitest';
import {
  planSheetMigration,
  type MigrationElement,
  type MigrationSheet,
  type MigrationTab,
} from './sheet-migration-plan';

// docs/specs/029-sheets/migration.md "What it does": what a document's stored Plan Sheets become, worked out pure.

const sheetEl = (id: string, sheetId: string): MigrationElement => ({
  id,
  type: 'shape',
  shape: 'plan-sheet',
  planSheet: { sheetId },
});
const chart = (id: string, sheetId: string): MigrationElement => ({
  id,
  type: 'shape',
  chartSource: { sheetId },
  sheetAnchor: { x: 0, y: 0 },
});
const box: MigrationElement = { id: 'box', type: 'shape', shape: 'rectangle' };
const tab = (
  id: string,
  name: string,
  kind: string | undefined,
  elements: MigrationElement[],
): MigrationTab => ({
  id,
  name,
  ...(kind ? { kind } : {}),
  elements,
});
const sheet = (
  id: string,
  tabId: string,
  title: string,
  extra: Partial<MigrationSheet> = {},
): MigrationSheet => ({
  id,
  tabId,
  title,
  cellCount: 10,
  cardTables: [],
  setupPending: false,
  ...extra,
});

describe('planSheetMigration', () => {
  it('turns a document of Sheet tabs into a spreadsheet in place, same names and order', () => {
    const plan = planSheetMigration({
      documentName: 'Budget',
      tabs: [
        tab('t1', 'Costs', 'sheet', [sheetEl('e1', 's1')]),
        tab('t2', 'Income', 'sheet', [sheetEl('e2', 's2')]),
      ],
      sheets: [sheet('s1', 't1', 'Sheet 1'), sheet('s2', 't2', 'Sheet 1')],
    });
    expect(plan).toMatchObject({
      kind: 'in-place',
      name: 'Budget',
      tabsRemoved: [],
      elementsRemoved: [],
      counts: { tabs: 2, sheets: 2, cells: 20, cardTables: 0, charts: 0 },
    });
    if (plan.kind === 'none') throw new Error('planned nothing');
    expect(plan.sheets.map((s) => [s.sheetId, s.name, s.tabId])).toEqual([
      ['s1', 'Costs', 't1'],
      ['s2', 'Income', 't2'],
    ]);
  });

  it("gives a tab's other Sheets tabs of their own after it, in element order, named after their sheets", () => {
    const plan = planSheetMigration({
      documentName: 'Budget',
      tabs: [
        tab('t1', 'Costs', 'sheet', [
          sheetEl('e1', 's1'),
          sheetEl('e2', 's3'),
          sheetEl('e3', 's2'),
        ]),
      ],
      sheets: [sheet('s1', 't1', 'Main'), sheet('s2', 't1', 'Costs'), sheet('s3', 't1', 'Old')],
    });
    if (plan.kind === 'none') throw new Error('planned nothing');
    // "Costs" is the tab's name already: the copy named so takes the next free name.
    expect(plan.sheets.map((s) => [s.sheetId, s.name, s.tabId])).toEqual([
      ['s1', 'Costs', 't1'],
      ['s3', 'Old', null],
      ['s2', 'Costs 2', null],
    ]);
  });

  it('fits a name the sheet rules refuse', () => {
    const plan = planSheetMigration({
      documentName: 'Budget',
      tabs: [tab('t1', "'Q1/Q2'", 'sheet', [sheetEl('e1', 's1')])],
      sheets: [sheet('s1', 't1', 'x')],
    });
    if (plan.kind === 'none') throw new Error('planned nothing');
    expect(plan.sheets[0]!.name).toBe('Q1 Q2');
  });

  it('moves the Sheets of a mixed document to "<Document> Sheets", in tab order', () => {
    const plan = planSheetMigration({
      documentName: 'Launch',
      tabs: [
        tab('t1', 'Board', 'board', []),
        tab('t2', 'Notes', undefined, [
          box,
          sheetEl('e2', 's2'),
          chart('c2', 's2'),
          chart('c9', 'sX'),
        ]),
        tab('t3', 'Budget', 'sheet', [sheetEl('e3', 's3'), chart('c3', 's3')]),
      ],
      sheets: [sheet('s2', 't2', 'Notes sheet'), sheet('s3', 't3', 'Budget')],
    });
    expect(plan).toMatchObject({
      kind: 'split',
      name: 'Launch Sheets',
      tabsRemoved: ['t3'],
      // The general tab keeps its other elements, a chart of another sheet among them.
      elementsRemoved: [{ tabId: 't2', ids: ['e2', 'c2'] }],
      counts: { tabs: 2, sheets: 2, charts: 2 },
    });
    if (plan.kind === 'none') throw new Error('planned nothing');
    expect(plan.sheets.map((s) => [s.sheetId, s.name, s.tabId, s.charts])).toEqual([
      ['s2', 'Notes sheet', null, ['c2']],
      ['s3', 'Budget', null, ['c3']],
    ]);
  });

  it("drops a card table's links and Controls column, and a sheet's waiting setup", () => {
    const plan = planSheetMigration({
      documentName: 'Tasks',
      tabs: [tab('t1', 'Tasks', 'sheet', [sheetEl('e1', 's1')])],
      sheets: [
        sheet('s1', 't1', 'Tasks', {
          cardTables: [{ id: 'ct1', controls: 'colx' }, { id: 'ct2' }],
          setupPending: true,
        }),
      ],
    });
    if (plan.kind === 'none') throw new Error('planned nothing');
    expect(plan.sheets[0]).toMatchObject({
      cardTables: ['ct1', 'ct2'],
      controlCols: ['colx'],
      setupDropped: true,
    });
    expect(plan.counts.cardTables).toBe(2);
  });

  it('leaves a sheet no Sheet shows to expire, and a Sheet tab with none goes', () => {
    const plan = planSheetMigration({
      documentName: 'Book',
      tabs: [
        tab('t1', 'One', 'sheet', [
          sheetEl('e1', 's1'),
          sheetEl('e1b', 's1'),
          sheetEl('eGone', 'sGone'),
        ]),
        tab('t2', 'Two', 'sheet', []),
      ],
      sheets: [sheet('s1', 't1', 'One'), sheet('sLeft', 't2', 'Left')],
    });
    expect(plan).toMatchObject({ kind: 'in-place', tabsRemoved: ['t2'], sheetsLeft: ['sLeft'] });
    if (plan.kind === 'none') throw new Error('planned nothing');
    // A pasted second element of the same sheet moves nothing more.
    expect(plan.sheets).toHaveLength(1);
  });

  it('plans nothing for a document with no Sheet', () => {
    expect(
      planSheetMigration({
        documentName: 'Map',
        tabs: [tab('t1', 'Map', undefined, [box])],
        sheets: [],
      }),
    ).toEqual({
      kind: 'none',
    });
    expect(planSheetMigration({ documentName: 'Empty', tabs: [], sheets: [] })).toEqual({
      kind: 'none',
    });
  });
});
