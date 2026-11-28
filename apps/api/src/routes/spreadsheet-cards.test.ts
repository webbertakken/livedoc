// docs/specs/029-sheets/plan-links.md "The `CARD` functions": outside the editor (downloads, a sheet read by another
// document, agents' views and pictures) the card functions read the cards' document the settings name, with the
// asker's own access; none named, or one the asker may not open, reads #REF!.
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkbookLinkResponse } from '@livedoc/api-schema';
import { WorkbookRecord } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

let kit: WorkbookKit;

const formula = (t: string) => ({ f: { t, r: [] } });

beforeEach(async () => {
  kit = workbookKit();
  const { rows, cols } = kit.layout;
  const cells = [
    { r: rows[0]!, c: cols[0]!, i: formula('CARDCOUNT()') },
    { r: rows[0]!, c: cols[1]!, i: formula('CARDCOUNT("State", "Shipped")') },
  ];
  expect((await kit.call({ path: '', body: kit.document('book1', true, cells) })).status).toBe(201);
  const plan = {
    ...kit.document('plan1', false),
    tabs: [{ id: 'plan1t', name: 'Board', elements: [board()] }],
    sheets: [],
    items: [
      { type: 'task', fields: { title: 'Sign up', status: 'done' } },
      { type: 'task', fields: { title: 'Log in', status: 'todo' } },
    ],
  };
  expect((await kit.call({ path: '', body: plan })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);",
  );
});

// A board whose Done column is named Shipped: State reads a status by its column's name.
function board() {
  return {
    id: 'board1',
    type: 'shape',
    shape: 'plan-board',
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    planBoard: {
      title: 'Work',
      columns: [
        { id: 'c1', status: 'todo', name: 'To Do' },
        { id: 'c2', status: 'done', name: 'Shipped' },
      ],
    },
  };
}

async function nameCards(cardsDocument: string) {
  const settings = {
    ...WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' }).settings,
    cardsDocument,
  };
  const res = await kit.call({
    method: 'PUT',
    path: '/book1/workbook/settings',
    body: { settings },
  });
  expect(res.status).toBe(200);
}

const csv = async (extra: { owner?: string; code?: string } = {}) =>
  (
    await kit.call({ method: 'GET', path: '/book1/workbook/file?format=csv&tab=book1t', ...extra })
  ).text();

describe('the card functions outside the editor', () => {
  it('read #REF! with no cards’ document named', async () => {
    expect(await csv()).toBe('#REF!,#REF!\r\n');
  });

  it('read the named document’s cards, its column names for State, in a download', async () => {
    await nameCards('plan1');
    expect(await csv()).toBe('2,1\r\n');
    const fods = await (
      await kit.call({ method: 'GET', path: '/book1/workbook/file?format=fods' })
    ).text();
    expect(fods).toMatch(
      /ORG\.LIVEDOC\.CARDCOUNT\(\)" office:value-type="float"[^>]*office:value="2"/,
    );
  });

  it('read them for a sheet another document reads', async () => {
    await nameCards('plan1');
    const res = await kit.call({ method: 'GET', path: '/book1/workbook/link?sheet=book1Sheet' });
    const body = await res.json<WorkbookLinkResponse>();
    expect(JSON.stringify(body)).toContain('"i":{"n":2}');
  });

  it('read them for an agent’s cells view and a sheet’s picture', async () => {
    await nameCards('plan1');
    const cells = await kit.call({ method: 'GET', path: '/book1/tabs/book1t?view=cells' });
    expect(await cells.text()).toContain(
      'A1 =CARDCOUNT() → 2 | B1 =CARDCOUNT("State", "Shipped") → 1',
    );
    const svg = await kit.call({ method: 'GET', path: '/book1/tabs/book1t/render.svg' });
    expect(await svg.text()).toContain('>2</');
  });

  it('read #REF! for an asker who may not open the cards’ document, the spreadsheet’s link granting nothing there', async () => {
    await nameCards('plan1');
    expect(await csv({ owner: 'e', code: 'EDIT' })).toBe('#REF!,#REF!\r\n');
  });

  it('read #REF! for a document that is not there', async () => {
    await nameCards('gone1');
    expect(await csv()).toBe('#REF!,#REF!\r\n');
  });
});
