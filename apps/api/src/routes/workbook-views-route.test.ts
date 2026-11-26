import { beforeEach, describe, expect, it } from 'vitest';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/024-agents/document-views.md "A spreadsheet's views": the workbook outline and the cells view through
// the tab GET, after its gate and scope, on a real SQLite.

let kit: WorkbookKit;

const view = (query: string, extra: { code?: string; owner?: string; tab?: string } = {}) =>
  kit.call({ method: 'GET', path: `/book1/tabs/${extra.tab ?? 'book1t'}?${query}`, ...extra });

beforeEach(async () => {
  kit = workbookKit();
  const { rows, cols } = kit.layout;
  const cells = [
    { r: rows[0]!, c: cols[0]!, i: { s: 'Model' } },
    { r: rows[0]!, c: cols[1]!, i: { s: 'Cost' } },
    { r: rows[1]!, c: cols[0]!, i: { s: 'Opus' } },
    { r: rows[1]!, c: cols[1]!, i: { n: 15 } },
  ];
  expect((await kit.call({ path: '', body: kit.document('book1', true, cells) })).status).toBe(201);
  expect((await kit.call({ path: '/book1/workbook/sheets', body: { name: 'Notes' } })).status).toBe(
    201,
  );
  expect((await kit.call({ path: '', body: kit.document('plan1', false, cells) })).status).toBe(
    201,
  );
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'view', 'book1t', 1);",
  );
});

describe('a spreadsheet’s outline', () => {
  it('answers the workbook outline on any of its tabs, the tab asked marked', async () => {
    const res = await view('view=outline');
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"/);
    expect((await res.text()).split('\n')).toEqual([
      'spreadsheet "Budget" · ods · 2 sheets · en-GB · Europe/London',
      'sheet "Sheet1" ◂ · A1:B2 · 4 cells',
      'sheet "Notes" · empty',
    ]);
  });

  it('answers JSON, and refuses only and style', async () => {
    const res = await view('view=outline&json=1');
    expect(await res.json()).toMatchObject({
      view: 'outline',
      spreadsheet: { name: 'Budget', format: 'ods' },
      sheets: [
        { title: 'Sheet1', used: 'A1:B2', current: true },
        { title: 'Notes', used: null },
      ],
    });
    for (const q of ['only=abcd', 'style=1']) {
      const refused = await view(`view=outline&${q}`);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ error: 'invalid_value' });
    }
  });

  it('shows a link to one tab only its own sheet', async () => {
    const res = await view('view=outline', { code: 'TAB1', owner: 'visitor' });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('Notes');
  });

  it('leaves a Plan document’s tab to its own outline', async () => {
    const plan = await kit.call({ method: 'GET', path: '/plan1/tabs/plan1t?view=outline' });
    expect(plan.status).toBe(200);
    expect(await plan.text()).toMatch(/^tab \S+ "Sheet1" · 0 elements/);
  });
});

describe('a spreadsheet’s cells', () => {
  it('reads the tab’s sheet a row a line, a range when named', async () => {
    const all = await view('view=cells');
    expect(all.status).toBe(200);
    expect((await all.text()).split('\n')).toEqual([
      'sheet "Sheet1" · cells A1:B2 of A1:B2',
      '1 | A1 "Model" | B1 "Cost"',
      '2 | A2 "Opus" | B2 15',
    ]);
    const one = await view('view=cells&range=B2&json=1');
    expect(await one.json()).toMatchObject({
      view: 'cells',
      range: 'B2',
      rows: [{ row: 2, cells: [{ at: 'B2', value: 15 }] }],
    });
  });

  it('refuses a range that is none, an empty or long one, and a tab that is no spreadsheet’s', async () => {
    const bad = await view('view=cells&range=nonsense');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({
      error: 'invalid_value',
      message: expect.stringContaining('A1'),
    });
    for (const range of ['', 'A'.repeat(41)]) {
      const refused = await view(`view=cells&range=${range}`);
      expect(refused.status).toBe(400);
    }
    const plan = await kit.call({ method: 'GET', path: '/plan1/tabs/plan1t?view=cells' });
    expect(plan.status).toBe(400);
    expect(await plan.json()).toEqual({
      error: 'invalid_value',
      message: "cells reads a spreadsheet's sheet",
    });
    const elsewhere = await view('view=layout&range=A1');
    expect(elsewhere.status).toBe(400);
  });
});
