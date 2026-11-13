import { describe, expect, it } from 'vitest';
import { readBoard } from '@livedoc/storm-reading';
import type { Element } from '@livedoc/document';
import { VerbRefusal } from '../define';
import {
  clearSuggestions,
  readStorm,
  suggestFromText,
  addPhotoNotes,
  suggestNotes,
  SUGGEST_NOTES_MAX,
  type StormRead,
} from '../storm/storm-calls';
import { contextOf, DOC_A, fakeApi, library } from '../testing/fake-api';
import { stormClear, stormExport, stormRead, stormSuggest } from './storm';

// The storm verbs and the calls the MCP shares (docs/specs/021-event-storming/suggestions.md "How an agent suggests").

const base = `/documents/${DOC_A}`;
const note = (
  id: string,
  esKind: string,
  x: number,
  label: string,
  extra: Record<string, unknown> = {},
) => {
  const sticky: Element = {
    id,
    type: 'sticky',
    x,
    y: 0,
    width: 200,
    height: 200,
    label,
    esKind,
    ...extra,
  } as Element;
  return sticky;
};
const elements = [
  note('cmd', 'command', 0, 'Place Order'),
  note('evt', 'domain-event', 216, 'Order Placed'),
  note('sug', 'actor', 0, 'Guest', { esSuggestion: { anchorId: 'cmd', side: 'above' } }),
];
const storm = () => {
  const tab = { id: 'es', name: 'Board', elements };
  const suggestions = [
    {
      id: 'sug',
      ref: 'sug',
      kind: 'actor',
      words: 'Guest',
      anchor: 'cmd',
      anchorRef: 'cmd',
      side: 'above',
      reason: null,
      gap: null,
      by: null,
      orphan: false,
    },
  ];
  return { reading: readBoard(tab), suggestions, rev: 3 };
};
const tabs = [
  { id: 'plain', name: 'Overview', orderIndex: 0 },
  { id: 'es', name: 'Board', orderIndex: 1 },
];
const notABoard = () => Response.json({ error: 'not_event_storming' }, { status: 400 });

function routesWith(more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...library,
    [base]: { document: { id: DOC_A, name: 'Auth flow', tabs } },
    [`${base}/tabs/plain?view=storm&json=1`]: notABoard,
    [`${base}/tabs/es?view=storm&json=1`]: storm(),
    [`${base}/tabs/es/changesets`]: (r: Request) =>
      Response.json({
        dryRun: false,
        changeset: { id: 'cs_1', rev: 4 },
        results: [],
        method: r.method,
      }),
    ...more,
  };
}
const doc = { id: DOC_A, tabs };

describe('readStorm', () => {
  it('finds the first board, passing over tabs that are not one', async () => {
    const read = await readStorm(fakeApi(routesWith()), doc);
    expect(read).toMatchObject({ ok: true, tabId: 'es', tabName: 'Board', rev: 3 });
    expect((read as StormRead).lines[0]).toContain('board "Board"');
  });

  it('takes a tab by name, id or id prefix', async () => {
    const api = fakeApi(routesWith());
    expect(await readStorm(api, doc, 'board')).toMatchObject({ tabId: 'es' });
    expect(await readStorm(api, doc, 'e')).toMatchObject({ tabId: 'es' });
  });

  it('refuses a tab it cannot find, a name for two tabs, and a tab that is no board', async () => {
    const api = fakeApi(routesWith());
    expect(await readStorm(api, doc, 'nope')).toMatchObject({ ok: false, code: 'tab_not_found' });
    const twins = { id: DOC_A, tabs: [...tabs, { id: 'es2', name: 'Board', orderIndex: 2 }] };
    expect(await readStorm(api, twins, 'board')).toMatchObject({
      ok: false,
      code: 'tab_ambiguous',
    });
    expect(await readStorm(api, doc, 'Overview')).toMatchObject({
      ok: false,
      code: 'not_event_storming',
      message: '"Overview" is not an Event Storming board.',
    });
    expect(await readStorm(api, { id: DOC_A, tabs: [tabs[0]!] })).toMatchObject({
      code: 'not_event_storming',
      message: 'This document has no Event Storming board.',
    });
  });

  it('words an api refusal, and lets anything else throw', async () => {
    const forbidden = fakeApi(
      routesWith({
        [`${base}/tabs/es?view=storm&json=1`]: () => Response.json({}, { status: 403 }),
      }),
    );
    expect(await readStorm(forbidden, doc, 'es')).toMatchObject({ ok: false, code: 'http_403' });
    const broken = fakeApi(
      routesWith({
        [`${base}/tabs/es?view=storm&json=1`]: () => new Response('down', { status: 500 }),
      }),
    );
    await expect(readStorm(broken, doc, 'es')).rejects.toThrow();
  });
});

describe('suggesting and clearing', () => {
  const board = { documentId: DOC_A, tabId: 'es' };
  const one = { kind: 'command', words: 'Pay', anchor: 'evt', side: 'before' as const };

  it('sends suggestions as one changeset of suggest operations', async () => {
    let sent: unknown = null;
    const api = fakeApi(
      routesWith({
        [`${base}/tabs/es/changesets`]: async (r: Request) => {
          sent = await r.json();
          return Response.json({ dryRun: false, changeset: { id: 'cs_1', rev: 4 }, results: [] });
        },
      }),
    );
    expect(await suggestNotes(api, board, [one], 'mcp')).toMatchObject({
      ok: true,
      changesetId: 'cs_1',
      rev: 4,
    });
    expect(sent).toEqual({ operations: [{ op: 'suggest', ...one }], summary: 'suggest 1 note' });
  });

  it('sends a wall of photos as one wall operation, and refuses none', async () => {
    let sent: unknown = null;
    const api = fakeApi(
      routesWith({
        [`${base}/tabs/es/changesets`]: async (r: Request) => {
          sent = await r.json();
          return Response.json({ dryRun: false, changeset: { id: 'cs_2', rev: 5 }, results: [] });
        },
      }),
    );
    const photo = { width: 100, height: 50, notes: [{ words: 'Paid', x: 5, y: 5, w: 10, h: 10 }] };
    expect(await addPhotoNotes(api, board, [photo, photo], 'mcp')).toMatchObject({
      ok: true,
      changesetId: 'cs_2',
    });
    expect(sent).toEqual({
      operations: [{ op: 'wall', photos: [photo, photo] }],
      summary: 'add 2 notes from 2 photos',
    });
    await addPhotoNotes(api, board, [photo], 'mcp');
    expect(sent).toMatchObject({ summary: 'add 1 note from 1 photo' });
    expect(await addPhotoNotes(api, board, [], 'mcp')).toMatchObject({ code: 'nothing_to_add' });
  });

  it('refuses none, or more than a call takes', async () => {
    const api = fakeApi(routesWith());
    expect(await suggestNotes(api, board, [], 'mcp')).toMatchObject({ code: 'nothing_to_suggest' });
    const many = Array.from({ length: SUGGEST_NOTES_MAX + 1 }, () => one);
    expect(await suggestNotes(api, board, many, 'mcp')).toMatchObject({
      code: 'too_many_suggestions',
    });
  });

  it('answers the engine refusal in its own words, and other refusals as the api words them', async () => {
    const engine = fakeApi(
      routesWith({
        [`${base}/tabs/es/changesets`]: () =>
          Response.json(
            { error: 'anchor_not_a_note', text: 'error anchor_not_a_note · op 1' },
            { status: 422 },
          ),
      }),
    );
    expect(await suggestNotes(engine, board, [one], 'cli')).toEqual({
      ok: false,
      code: 'anchor_not_a_note',
      message: 'error anchor_not_a_note · op 1',
    });
    const noText = fakeApi(
      routesWith({
        [`${base}/tabs/es/changesets`]: () => Response.json({ error: 'locked' }, { status: 403 }),
      }),
    );
    expect(await suggestNotes(noText, board, [one], 'cli')).toMatchObject({
      ok: false,
      code: 'locked',
    });
    const notJson = fakeApi(
      routesWith({ [`${base}/tabs/es/changesets`]: () => new Response('nope', { status: 403 }) }),
    );
    expect(await suggestNotes(notJson, board, [one], 'cli')).toMatchObject({
      ok: false,
      code: 'http_403',
    });
    const down = fakeApi(
      routesWith({ [`${base}/tabs/es/changesets`]: () => new Response('down', { status: 503 }) }),
    );
    await expect(suggestNotes(down, board, [one], 'cli')).rejects.toThrow();
  });

  it('takes suggest lines, and only those', async () => {
    const api = fakeApi(routesWith());
    expect(await suggestFromText(api, board, '# nothing\n\n', 'cli')).toMatchObject({
      code: 'nothing_to_suggest',
    });
    expect(await suggestFromText(api, board, 'rm cmd', 'cli')).toMatchObject({
      code: 'not_a_suggestion',
    });
    const lines = Array.from(
      { length: SUGGEST_NOTES_MAX + 1 },
      () => 'suggest command "x" before=evt',
    ).join('\n');
    expect(await suggestFromText(api, board, lines, 'cli')).toMatchObject({
      code: 'too_many_suggestions',
    });
    expect(
      await suggestFromText(
        api,
        board,
        'suggest command "Pay" before=evt\n{"op":"suggest"}',
        'cli',
      ),
    ).toMatchObject({ ok: true });
  });

  it('counts in plurals, and reports no changeset when none was written', async () => {
    let summary = '';
    const api = fakeApi(
      routesWith({
        [`${base}/tabs/es/changesets`]: async (r: Request) => {
          summary = ((await r.json()) as { summary: string }).summary;
          return Response.json({ dryRun: true, changeset: null, results: [] });
        },
      }),
    );
    expect(await suggestNotes(api, board, [one, one], 'mcp')).toMatchObject({
      changesetId: null,
      rev: null,
    });
    expect(summary).toBe('suggest 2 notes');
    const read = (await readStorm(api, doc)) as StormRead;
    await clearSuggestions(
      api,
      { ...read, suggestions: [...read.suggestions, ...read.suggestions] },
      'cli',
    );
    expect(summary).toBe('clear 2 suggestions');
  });

  it('removes every open suggestion, or says there are none', async () => {
    const api = fakeApi(routesWith());
    const read = (await readStorm(api, doc)) as StormRead;
    expect(await clearSuggestions(api, read, 'cli')).toMatchObject({
      ok: true,
      changesetId: 'cs_1',
    });
    expect(await clearSuggestions(api, { ...read, suggestions: [] }, 'cli')).toMatchObject({
      ok: true,
      changesetId: null,
      lines: [],
    });
  });
});

describe('the storm verbs', () => {
  const ctxWith = (routes = routesWith(), input = '') =>
    contextOf(fakeApi(routes), [], [], { readInput: async () => input });

  it('storm read prints the reading', async () => {
    const out = await stormRead.run!(ctxWith(), { doc: 'Auth flow', tab: undefined });
    expect(out).toMatchObject({ tabId: 'es', gaps: 1, suggestions: 1 });
    expect(stormRead.text!(out)[0]).toContain('board "Board"');
  });

  it('storm read refuses a document with no board, pointing at the template', async () => {
    const routes = routesWith({ [`${base}/tabs/es?view=storm&json=1`]: notABoard });
    const refusal = await stormRead.run!(ctxWith(routes), {
      doc: 'Auth flow',
      tab: undefined,
    }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(VerbRefusal);
    expect((refusal as VerbRefusal).hint).toContain('--template event-storming');
    const missing = await stormRead.run!(ctxWith(), { doc: 'Auth flow', tab: 'zzz' }).catch(
      (e: unknown) => e,
    );
    expect((missing as VerbRefusal).status).toBe(404);
    expect((missing as VerbRefusal).hint).toContain('storm read');
  });

  it('storm suggest sends the file, and prints the changeset', async () => {
    const out = await stormSuggest.run!(ctxWith(routesWith(), 'suggest command "Pay" before=evt'), {
      doc: 'Auth flow',
      tab: undefined,
      file: '-',
    });
    expect(stormSuggest.text!(out)).toEqual(['changeset cs_1']);
    expect(stormSuggest.quiet!(out)).toEqual(['cs_1']);
    expect(stormSuggest.quiet!({ ...out, changesetId: null })).toEqual([]);
    expect(stormSuggest.text!({ ...out, changesetId: null })).toEqual([]);
  });

  it('storm clear removes them, or says there were none', async () => {
    const out = await stormClear.run!(ctxWith(), { doc: 'Auth flow', tab: undefined });
    expect(stormClear.text!({ ...out, lines: ['- sug  sticky "Guest"'] })).toEqual([
      '- sug  sticky "Guest"',
      'changeset cs_1',
    ]);
    expect(stormClear.text!({ ...out, lines: [] })).toEqual(['no open suggestions']);
  });

  it('storm export prints where the bundle went and what is next', () => {
    const o = {
      dir: '/r/.livedoc/storm/board',
      language: 'go',
      because: 'go.mod at its root',
      notes: 1,
      gaps: 2,
      changes: null,
      files: ['storm.json'],
    };
    expect(stormExport.text!(o)).toEqual([
      '/r/.livedoc/storm/board  1 note · 2 gaps · first export',
      'language go (go.mod at its root)',
      '  storm.json',
      'next: follow /r/.livedoc/storm/board/CONVERT.md',
    ]);
    expect(stormExport.text!({ ...o, changes: 1 })[0]).toContain('1 change');
    expect(stormExport.quiet!(o)).toEqual(['/r/.livedoc/storm/board']);
  });
});
