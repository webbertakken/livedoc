import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentResponse, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { NAMED_FUNCTIONS_MAX, WorkbookRecord, type NamedFunction } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/sheet-store.md "Changing the workbook": a spreadsheet's named functions saved whole through the
// api (formulas.md "Named functions", data-tools.md "Named ranges and named functions").

let kit: WorkbookKit;

const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
const CONTAINS: NamedFunction = {
  name: 'CONTAINS',
  params: ['search_query', 'search_range'],
  body: '=NOT(ISERROR(MATCH(search_query, search_range, 0)))',
  description: 'Whether the range holds the value',
  hints: [{ description: 'The value', example: '"x"' }, null],
};

const save = (
  body: unknown,
  extra: Partial<Parameters<WorkbookKit['call']>[0]> = {},
  id = 'book1',
) => kit.call({ method: 'PUT', path: `/${id}/workbook/functions`, body, ...extra });

const workbookRead = async () =>
  (await (await kit.call({ method: 'GET', path: '/book1' })).json<DocumentResponse>()).document
    .workbook;

beforeEach(async () => {
  kit = workbookKit();
  expect((await kit.call({ path: '', body: kit.document('book1', true) })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, level, tab_id, created_at) VALUES ('PART', 'book1', 'view', 'participate', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
  kit.relayed.length = 0;
});

describe('saving the named functions', () => {
  it('saves them whole, answers the new rev, sends them live and reads them back', async () => {
    const res = await save({ functions: [CONTAINS] });
    expect(res.status).toBe(200);
    const workbook = { ...made, functions: [CONTAINS] };
    expect(await res.json<WorkbookSettingsResponse>()).toEqual({ workbook, rev: 1 });
    expect(await workbookRead()).toEqual(workbook);
    expect(kit.relayed).toEqual([{ kind: 'workbook', workbook, rev: 1 }]);
  });

  it('saves none as none', async () => {
    await save({ functions: [CONTAINS] });
    const res = await save({ functions: [] });
    expect((await res.json<WorkbookSettingsResponse>()).workbook).toEqual(made);
    expect(await workbookRead()).toEqual(made);
  });

  it.each([
    ['nothing', {}],
    ['a list that is not one', { functions: 'x' }],
    ['a built-in function’s name', { functions: [{ ...CONTAINS, name: 'SUM' }] }],
    ['a name not in capitals', { functions: [{ ...CONTAINS, name: 'contains' }] }],
    ['a reference in a definition', { functions: [{ ...CONTAINS, body: '=A1' }] }],
    ['two of one name', { functions: [CONTAINS, CONTAINS] }],
  ])('refuses %s', async (_, body) => {
    const res = await save(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'functions_invalid' });
    expect(await workbookRead()).toEqual(made);
    expect(kit.relayed).toEqual([]);
  });

  it('refuses more than a workbook keeps', async () => {
    const functions = Array.from({ length: NAMED_FUNCTIONS_MAX + 1 }, (_, i) => ({
      ...CONTAINS,
      name: `F_${i}`,
    }));
    const res = await save({ functions });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'functions_full' });
  });

  it('drops a stored list that does not read, keeping the workbook', async () => {
    kit.sql.sql.exec('UPDATE workbook SET functions = \'[{"name":1}]\'');
    expect(await workbookRead()).toEqual(made);
    kit.sql.sql.exec("UPDATE workbook SET functions = 'not json'");
    expect(await workbookRead()).toEqual(made);
  });

  it("is an Editor's", async () => {
    const body = { functions: [CONTAINS] };
    expect((await save(body, { owner: 'p', code: 'PART' })).status).toBe(403);
    expect((await save(body, { owner: 'p', code: 'TAB1' })).status).toBe(404);
    expect((await save(body, { owner: 'e', code: 'EDIT' })).status).toBe(200);
  });

  it('refuses a document that is no spreadsheet, and another method', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await save({ functions: [] }, {}, 'plan1');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'workbook_not_found' });
    expect((await kit.call({ method: 'POST', path: '/book1/workbook/functions' })).status).toBe(
      405,
    );
  });
});
