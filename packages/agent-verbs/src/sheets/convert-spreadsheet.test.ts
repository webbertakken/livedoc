// Converting a spreadsheet for an agent (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet",
// D271): the losses in the dialog's words, then the conversion; with check, the losses alone; refusals in words.
import { describe, expect, it } from 'vitest';
import { VerbRefusal } from '../define';
import { contextOf, DOC_A, fakeApi, library, tabsOfA } from '../testing/fake-api';
import { spreadsheetConvert, spreadsheetDownload } from '../verbs/spreadsheet';
import { convertSpreadsheet } from './convert-spreadsheet';

const path = `/documents/${DOC_A}/workbook/conversion`;

function apiWith(answer: (r: Request) => Response) {
  const posted: unknown[] = [];
  const api = fakeApi({
    ...library,
    ...tabsOfA,
    [path]: async (r: Request) => {
      if (r.method === 'POST') {
        posted.push(await r.json());
        return Response.json({ workbook: {}, rev: 2 });
      }
      return answer(r);
    },
  });
  return { api, posted };
}

const losses = () =>
  Response.json({ from: 'ods', to: 'xlsx', losses: [{ k: 'text_cut', count: 2 }] });

describe('convertSpreadsheet', () => {
  it('answers the losses, then converts', async () => {
    const { api, posted } = apiWith(losses);
    const out = await convertSpreadsheet(api, DOC_A, { to: 'xlsx' }, 'mcp');
    expect(out).toMatchObject({ ok: true, from: 'ods', to: 'xlsx', converted: true });
    expect(out.ok && out.losses[0]).toBe('The .xlsx file cannot hold:');
    expect(out.ok && out.losses).toHaveLength(2);
    expect(posted).toEqual([{ format: 'xlsx' }]);
  });

  it('only answers the losses with check', async () => {
    const { api, posted } = apiWith(losses);
    const out = await convertSpreadsheet(api, DOC_A, { to: 'xlsx', check: true }, 'cli');
    expect(out).toMatchObject({ ok: true, converted: false });
    expect(posted).toEqual([]);
  });

  it('words the api’s refusal, and lets a failure that is none throw', async () => {
    const { api } = apiWith(() =>
      Response.json({ error: 'format_same_standard' }, { status: 409 }),
    );
    const out = await convertSpreadsheet(api, DOC_A, { to: 'fods' }, 'mcp');
    expect(out).toEqual({
      ok: false,
      code: 'format_same_standard',
      message: expect.stringContaining('already in that standard'),
    });
    const { api: down } = apiWith(() => new Response('boom', { status: 500 }));
    await expect(convertSpreadsheet(down, DOC_A, { to: 'xlsx' }, 'mcp')).rejects.toThrow();
  });
});

describe('spreadsheet convert', () => {
  it('prints what it converted and what the format cannot hold', async () => {
    const { api } = apiWith(losses);
    const ctx = contextOf(api);
    const out = await spreadsheetConvert.run!(
      ctx,
      spreadsheetConvert.input.parse({ doc: DOC_A, to: 'xlsx' }),
    );
    expect(spreadsheetConvert.text!(out)[0]).toBe('~ spreadsheet converted ods → xlsx');
    expect(spreadsheetConvert.quiet!(out)).toEqual([DOC_A]);
    expect(spreadsheetConvert.text!({ ...out, converted: false })[0]).toBe(
      'spreadsheet ods → xlsx, not converted',
    );
  });

  it('refuses as the api does, a document that is no spreadsheet as missing', async () => {
    for (const [error, status] of [
      ['workbook_not_found', 404],
      ['format_same_standard', 409],
    ] as const) {
      const { api } = apiWith(() => Response.json({ error }, { status }));
      const run = spreadsheetConvert.run!(
        contextOf(api),
        spreadsheetConvert.input.parse({ doc: DOC_A, to: 'ods', check: true }),
      );
      await expect(run).rejects.toBeInstanceOf(VerbRefusal);
      await expect(run).rejects.toMatchObject({ status, code: error });
    }
  });
});

describe('spreadsheet download', () => {
  it('is the CLI’s to run, printing its lines', () => {
    expect(spreadsheetDownload.local).toBe(true);
    expect(spreadsheetDownload.text!({ lines: ['a.ods  2 KB'] })).toEqual(['a.ods  2 KB']);
    expect(spreadsheetDownload.input.parse({ doc: 'x', format: 'csv' }).format).toBe('csv');
  });
});
