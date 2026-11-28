import { beforeEach, describe, expect, it } from 'vitest';
import { LiveThreads, TextDocumentState } from '@livedoc/text-documents';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { createShareLink } from '../db/share';
import { appendLiveTabUpdate } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { handleDocuments } from './documents';
import { makeTestRouteContext } from './test-route-context';

// docs/specs/034-text-documents/agents-and-sync.md "Reading": a text document's outline, text and structure through
// the tab GET, after its gate and scope; a Viewer reads their copy, without comments or authors.

const ADA = { key: 'key-ada-77', name: 'Ada Secretname', colour: '#1a73e8' };
const SECRET = 'Confidential remark';

let db: SqliteD1;

function view(query: string, code?: string) {
  return handleDocuments(
    makeTestRouteContext('GET', `/api/documents/D/tabs/t1?${query}`, {
      env: db.env,
      owner: code ? 'visitor' : 'owner',
      ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    }),
  );
}

async function create(id: string, tabs: { id: string; kind: string }[]) {
  const res = await handleDocuments(
    makeTestRouteContext('POST', '/api/documents', {
      env: db.env,
      owner: 'owner',
      body: {
        id,
        name: 'Report',
        tabs: tabs.map((t) => ({ ...t, name: 'T', format: 'odf', elements: [] })),
      },
    }),
  );
  expect(res.status).toBe(201);
}

beforeEach(async () => {
  db = sqliteD1();
  await create('D', [
    { id: 't1', kind: 'text-document' },
    { id: 't2', kind: 'diagram' },
  ]);
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text: 'Quarterly results' }, { text: 'Second line' }]);
  const run = (
    TextDocumentState.body(doc).get(0) as unknown as {
      get: (i: number) => { format: (at: number, length: number, attributes: object) => void };
    }
  ).get(0);
  run.format(0, 9, { insertion: { id: 's1', at: 1, author: ADA } });
  LiveThreads.begin(
    doc,
    {
      id: 'thread-1',
      tab: 't.0',
      ...LiveThreads.anchorFor(run as never, 0, 9),
      quote: 'Quarterly',
      comment: { id: 'c1', text: SECRET, at: 1, author: ADA },
    },
    'test',
  );
  await appendLiveTabUpdate(db.env, TEXT_DOCUMENT_LIVE_TAB, 't1', TextDocumentState.encode(doc));
  await createShareLink(db.env, 'D', 'VIEWCODE', 'view');
  await createShareLink(db.env, 'D', 'EDITCODE', 'edit');
  await createShareLink(db.env, 'D', 'SCOPED', 'edit', 'never', 't2');
});

describe('a text document’s views', () => {
  it('answers the outline by default on its tab', async () => {
    const res = await view('view=outline');
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"/);
    expect((await res.text()).split('\n')).toEqual([
      'text-document "Report" · odt · 1 document tab · 2 paragraphs',
      'tab "Tab 1" ◂',
      '  no headings',
    ]);
  });

  it('reads the writing, pending suggestions marked, by paragraph number', async () => {
    const res = await view('view=text&lines=1&range=1..2');
    expect(await res.text()).toBe(
      [
        'text-document tab "Tab 1" · 2 paragraphs · ¶1..¶2',
        '¶1 {++Quarterly++} results',
        '',
        '¶2 Second line',
      ].join('\n'),
    );
    const one = await view('view=text&range=2&json=1');
    expect(await one.json()).toMatchObject({ view: 'text', range: '2', markdown: 'Second line' });
  });

  it('reads the structure with its comments and suggestions for an Editor', async () => {
    const text = await (await view('view=structure', 'EDITCODE')).text();
    expect(text).toContain('  thread-1 ¶1 "Quarterly" 0 replies');
    expect(text).toContain(`  s1 insertion ¶1 "Quarterly" by "${ADA.name}"`);
  });

  it('gives a Viewer their copy: no comments, no authors', async () => {
    const res = await view('view=structure', 'VIEWCODE');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('comments none');
    expect(text).not.toContain(ADA.name);
    expect(text).not.toContain(SECRET);
  });

  it('refuses the element views, an unknown document tab and a range outside the tab', async () => {
    for (const [query, message] of [
      ['view=graph', 'graph reads a canvas tab; a text document reads outline, text or structure'],
      ['view=text&only=Nope', 'only names a document tab of this text document, by its id or name'],
      [
        'view=text&range=3',
        'range takes paragraph numbers from 1 to 2, like 1..2 or one number: "3"',
      ],
    ] as const) {
      const res = await view(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_value', message });
    }
  });

  it('refuses text and structure on a canvas tab, and lines elsewhere than text', async () => {
    const canvas = await handleDocuments(
      makeTestRouteContext('GET', '/api/documents/D/tabs/t2?view=text', {
        env: db.env,
        owner: 'owner',
      }),
    );
    expect(canvas.status).toBe(400);
    expect(await canvas.json()).toMatchObject({
      message: 'text reads a text document; this tab is none',
    });
    expect((await view('view=structure&lines=1')).status).toBe(400);
  });

  it('keeps a link scoped to another tab out', async () => {
    expect((await view('view=outline', 'SCOPED')).status).toBe(404);
  });
});
