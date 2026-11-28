import { describe, expect, it, vi } from 'vitest';
// The resvg WASM renderer cannot load in plain node (see tools.test.ts); the text document tools never render.
vi.mock('./image-result', async () => {
  const { textDocumentPages } = await import('./text-document-preview');
  return {
    imageResult: () => ({ content: [] }),
    drawTextDocumentPages: (
      ...args: Parameters<typeof textDocumentPages> extends [...infer A, unknown] ? A : never
    ) => textDocumentPages(...args, async () => 'cG5n'),
  };
});

import { connectTestClient } from './mcp-test-client';

// The text document tools end to end through a real SDK client (docs/specs/015-api/mcp-server.md §4.9g;
// docs/specs/034-text-documents/agents-and-sync.md "Verbs"): a mistake the caller can fix is a tool error in words.
const LIVE_DOC = {
  id: 'd1',
  name: 'Launch',
  tabs: [
    { id: 'c1', name: 'Canvas', orderIndex: 0 },
    { id: 'w2', name: 'Notes', orderIndex: 2, kind: 'text-document' },
    { id: 'w1', name: 'Plan', orderIndex: 1, kind: 'text-document' },
  ],
};

type Seen = { method: string; path: string; body?: unknown };

function api(opts: { document?: unknown; refuse?: { status: number; body: unknown } } = {}) {
  const seen: Seen[] = [];
  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = `${url.pathname.replace(/^\/api/, '')}${url.search}`;
    if (path.endsWith('/events')) return new Response(null, { status: 204 });
    const body = request.method === 'POST' ? await request.json() : undefined;
    seen.push({ method: request.method, path, ...(body === undefined ? {} : { body }) });
    if (opts.refuse && request.method === 'POST')
      return Response.json(opts.refuse.body, { status: opts.refuse.status });
    if (url.pathname.endsWith('/changesets'))
      return Response.json({
        dryRun: url.searchParams.has('dryRun'),
        changeset: url.searchParams.has('dryRun')
          ? null
          : {
              id: 'tc_0000000001',
              tabId: 'w1',
              documentTab: 't.0',
              counts: { added: 1, changed: 0, removed: 0 },
            },
        results: ['appended ¶4'],
        text: 'appended ¶4',
      });
    if (url.pathname.endsWith('/page-previews'))
      return url.searchParams.get('pages') === '9'
        ? Response.json(
            { error: 'page_not_found', message: 'This document tab has 2 pages.' },
            { status: 404 },
          )
        : Response.json({
            pages: [{ number: 1, width: 816, height: 1056, svg: '<svg/>' }],
            pageCount: 2,
            approximate: true,
          });
    if (url.searchParams.has('view'))
      return new Response('# Plan\n¶1 Goals', { headers: { 'X-State-Vector': 'AQID' } });
    if (path === '/documents' && request.method === 'POST')
      return Response.json({ document: { id: 'made', folderId: null } });
    return Response.json({ document: opts.document ?? LIVE_DOC });
  };
  return { handler, seen };
}

type Result = {
  isError?: boolean;
  content: { text: string }[];
  structuredContent?: Record<string, unknown>;
};

async function call(
  handler: (r: Request) => Promise<Response>,
  name: string,
  args: Record<string, unknown>,
) {
  const client = await connectTestClient(handler);
  return (await client.callTool({ name, arguments: args })) as Result;
}

describe('read_text_document', () => {
  it('reads the first text document tab’s outline, with the state it was read at', async () => {
    const { handler, seen } = api();
    const read = await call(handler, 'read_text_document', { documentId: 'd1' });
    expect(read.structuredContent).toMatchObject({
      documentId: 'd1',
      tabId: 'w1',
      view: 'outline',
      text: '# Plan\n¶1 Goals',
      stateVector: 'AQID',
    });
    expect(seen.at(-1)!.path).toBe('/documents/d1/tabs/w1?view=outline');
  });

  it('reads a tab by name, a view, a range and the paragraph numbers', async () => {
    const { handler, seen } = api();
    await call(handler, 'read_text_document', {
      documentId: 'd1',
      tabId: 'notes',
      view: 'text',
      only: 'Intro',
      range: '1..5',
      lines: true,
    });
    expect(seen.at(-1)!.path).toBe('/documents/d1/tabs/w2?view=text&only=Intro&range=1..5&lines=1');
  });

  it('refuses a tab that is no text document, naming the ones there are, and a document with none', async () => {
    const { handler } = api();
    const named = await call(handler, 'read_text_document', { documentId: 'd1', tabId: 'Canvas' });
    expect(named.isError).toBe(true);
    expect(named.content[0]!.text).toBe(
      'Launch holds no text document tab "Canvas". Text document tabs: "Plan" (w1), "Notes" (w2).',
    );
    const bare = api({
      document: { id: 'd1', name: 'Board', tabs: [{ id: 'c1', name: 'C', orderIndex: 0 }] },
    });
    const none = await call(bare.handler, 'read_text_document', { documentId: 'd1' });
    expect(none.content[0]!.text).toBe(
      'Board holds no text document. read_document reads its tabs.',
    );
  });
});

describe('read_text_document with image', () => {
  it('attaches its pages’ pictures after the view, saying they are approximate', async () => {
    const { handler, seen } = api();
    const read = (await (
      await connectTestClient(handler)
    ).callTool({
      name: 'read_text_document',
      arguments: { documentId: 'd1', image: true, only: 'Intro' },
    })) as Omit<Result, 'content'> & { content: { type: string }[] };
    expect(read.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(read.structuredContent).toMatchObject({
      preview: { pages: [1], pageCount: 2, note: expect.stringMatching(/^An approximate preview/) },
    });
    expect(seen.at(-1)!.path).toBe('/documents/d1/tabs/w1/page-previews?only=Intro');
  });

  it('answers a page past the end in the api’s words', async () => {
    const { handler } = api();
    const read = await call(handler, 'read_text_document', {
      documentId: 'd1',
      image: true,
      pages: '9',
    });
    expect(read.isError).toBe(true);
    expect(read.content[0]!.text).toBe('This document tab has 2 pages.');
  });
});

describe('edit_text_document', () => {
  it('sends the operations as one changeset and answers its results', async () => {
    const { handler, seen } = api();
    const edited = await call(handler, 'edit_text_document', {
      documentId: 'd1',
      ops: 'append "Next steps"',
      documentTab: 'Intro',
      summary: 'next steps',
      base: 'AQID',
    });
    expect(edited.structuredContent).toMatchObject({
      tabId: 'w1',
      dryRun: false,
      results: ['appended ¶4'],
      changeset: { id: 'tc_0000000001', counts: { added: 1, changed: 0, removed: 0 } },
    });
    expect(seen.at(-1)).toEqual({
      method: 'POST',
      path: '/documents/d1/tabs/w1/changesets',
      body: {
        ops: 'append "Next steps"',
        documentTab: 'Intro',
        summary: 'next steps',
        base: 'AQID',
      },
    });
  });

  it('answers a dry run, writing nothing', async () => {
    const { handler, seen } = api();
    const dry = await call(handler, 'edit_text_document', {
      documentId: 'd1',
      ops: 'x',
      dryRun: true,
    });
    expect(dry.structuredContent).toMatchObject({ dryRun: true, changeset: null });
    expect(seen.at(-1)!.path).toBe('/documents/d1/tabs/w1/changesets?dryRun=1');
  });

  it('answers a refusal naming its line, or the changeset as a whole', async () => {
    const line = api({
      refuse: {
        status: 422,
        body: { error: 'text_ambiguous', line: 2, operation: 2, message: '"Q3" occurs in ¶4, ¶9' },
      },
    });
    const refused = await call(line.handler, 'edit_text_document', { documentId: 'd1', ops: 'x' });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toBe('text_ambiguous line 2: "Q3" occurs in ¶4, ¶9');
    const whole = api({
      refuse: { status: 403, body: { error: 'forbidden', message: 'view only' } },
    });
    const forbidden = await call(whole.handler, 'edit_text_document', {
      documentId: 'd1',
      ops: 'x',
    });
    expect(forbidden.content[0]!.text).toBe('forbidden: view only');
  });

  it('refuses a tab that is no text document before sending anything', async () => {
    const { handler, seen } = api();
    const refused = await call(handler, 'edit_text_document', {
      documentId: 'd1',
      tabId: 'c1',
      ops: 'x',
    });
    expect(refused.isError).toBe(true);
    expect(seen.filter((s) => s.method === 'POST')).toEqual([]);
  });
});

describe('create_document with kind text-document', () => {
  it('makes a text document from Markdown, born in ODF and made by AI', async () => {
    const { handler, seen } = api();
    const made = await call(handler, 'create_document', {
      name: 'Plan',
      kind: 'text-document',
      markdown: '# Plan',
      markUsed: false,
    });
    expect(made.structuredContent).toMatchObject({
      name: 'Plan',
      tabCount: 1,
      folder: 'My Documents',
      lint: [],
    });
    const [post] = seen.filter((s) => s.method === 'POST');
    expect(post!.body).toMatchObject({
      name: 'Plan',
      source: 'mcp',
      markUsed: false,
      tabs: [{ kind: 'text-document', format: 'odf', name: 'Plan' }],
      textDocuments: [{ file: 'IyBQbGFu', type: 'md' }],
    });
  });

  it('makes a blank one without Markdown', async () => {
    const { handler, seen } = api();
    await call(handler, 'create_document', { name: 'Blank', kind: 'text-document' });
    const [post] = seen.filter((s) => s.method === 'POST');
    expect(post!.body).not.toHaveProperty('textDocuments');
  });

  it('refuses tabs with it, Markdown without it, and words the api’s refusal', async () => {
    const { handler } = api();
    const tabs = await call(handler, 'create_document', {
      name: 'X',
      kind: 'text-document',
      tabs: [{ name: 'T', elements: [] }],
    });
    expect(tabs.content[0]!.text).toBe('A text document takes its body as "markdown", not "tabs".');
    const loose = await call(handler, 'create_document', { name: 'X', markdown: '# X' });
    expect(loose.content[0]!.text).toBe(
      '"markdown" is a text document’s body: pass kind "text-document" with it.',
    );
    const refusing = api({
      refuse: { status: 400, body: { error: 'text_document_seed_invalid' } },
    });
    const refused = await call(refusing.handler, 'create_document', {
      name: 'X',
      kind: 'text-document',
      markdown: '#',
    });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toMatch(/^text_document_seed_invalid: /);
  });
});
