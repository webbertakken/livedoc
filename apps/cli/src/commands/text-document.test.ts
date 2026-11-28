import { beforeEach, describe, expect, it } from 'vitest';
import { run } from '../main';
import { fakeIo, NOW, TOKEN, type FakeIo, type Route } from '../testing/fake-io';

// The text document commands (docs/specs/034-text-documents/agents-and-sync.md "CLI"): `livedoc text view|edit|
// download|import`, the kind's own resource.

const DOC = 'aaaa1111-0000-4000-8000-000000000003';
const BARE = 'aaaa1111-0000-4000-8000-000000000004';
const HOST = 'https://docs.nu';
const ODT = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9]);
let asked: { method: string; path: string; body?: unknown }[] = [];

const host: Route = async (r, url) => {
  const path = url.pathname;
  if (path === '/api/capabilities')
    return Response.json({ apiBase: `${HOST}/api`, authEnabled: true, documentFormat: 2 });
  if (path === '/api/teams') return Response.json({ teams: [] });
  if (path === '/api/documents' && r.method === 'GET')
    return Response.json({
      documents: [
        { id: DOC, name: 'Launch plan', savedAt: NOW, ownerId: 'u' },
        { id: BARE, name: 'Board', savedAt: NOW, ownerId: 'u' },
      ],
    });
  if (path === '/api/documents' && r.method === 'POST') {
    const body = (await r.json()) as { name: string };
    asked.push({ method: 'POST', path, body });
    if (body.name === 'Broken') return Response.json({ error: 'package_damaged' }, { status: 400 });
    return Response.json({});
  }
  if (path === `/api/documents/${DOC}`)
    return Response.json({
      document: {
        id: DOC,
        name: 'Launch plan',
        presentation: null,
        tabs: [
          { id: 'canvas', name: 'Canvas', orderIndex: 0 },
          { id: 'words', name: 'Words', orderIndex: 1, kind: 'text-document' },
          { id: 'notes', name: 'Notes', orderIndex: 2, kind: 'text-document' },
        ],
      },
    });
  if (path === `/api/documents/${BARE}`)
    return Response.json({
      document: {
        id: BARE,
        name: 'Board',
        presentation: null,
        tabs: [{ id: 'c', name: 'C', orderIndex: 0 }],
      },
    });
  if (path === `/api/documents/${DOC}/tabs/words` && r.method === 'GET') {
    if (url.searchParams.has('view')) {
      asked.push({ method: 'GET', path: `${path}${url.search}` });
      return new Response(`view ${url.searchParams.get('view')}`);
    }
    return Response.json({ id: 'words', kind: 'text-document', format: 'ooxml', elements: [] });
  }
  if (path === `/api/documents/${DOC}/tabs/words/changesets`) {
    const body = (await r.json()) as { ops: string };
    asked.push({ method: 'POST', path: `${path}${url.search}`, body });
    if (body.ops.includes('nowhere'))
      return Response.json(
        {
          error: 'text_not_found',
          line: 2,
          operation: 2,
          message: '"nowhere" is not in the document tab',
        },
        { status: 422 },
      );
    if (body.ops.includes('boom')) return new Response('down', { status: 400 });
    const dryRun = url.searchParams.get('dryRun') === '1';
    return Response.json({
      dryRun,
      changeset: dryRun
        ? null
        : {
            id: 'tc_0000000001',
            tabId: 'words',
            documentTab: 't.0',
            counts: { added: 1, changed: 1, removed: 0 },
          },
      results: ['edited ¶1', 'appended ¶9'],
      text: 'edited ¶1\nappended ¶9',
    });
  }
  if (path === `/api/documents/${DOC}/text-documents/words/file`) {
    asked.push({ method: 'GET', path: `${path}${url.search}` });
    if (url.searchParams.get('type') === 'rtf')
      return Response.json({ error: 'file_type_unknown' }, { status: 400 });
    if (url.searchParams.get('type') === 'epub') return new Response('nope', { status: 500 });
    return new Response(ODT, {
      headers: {
        'Content-Disposition': `attachment; filename="Launch plan.${url.searchParams.get('type')}"`,
      },
    });
  }
  return undefined;
};

async function cli(
  argv: string[],
  opts: { bytes?: Record<string, Uint8Array>; stdin?: string } = {},
) {
  const io: FakeIo = fakeIo({
    env: { LIVEDOC_TOKEN: TOKEN },
    routes: [host],
    ...(opts.bytes ? { bytes: opts.bytes } : {}),
    ...(opts.stdin !== undefined ? { stdin: opts.stdin } : {}),
  });
  const code = await run(argv, io);
  return { code, io, out: io.out(), err: io.err() };
}

beforeEach(() => {
  asked = [];
});

describe('livedoc text view', () => {
  it('reads the first text document tab’s outline, or the view asked', async () => {
    const outline = await cli(['text', 'view', DOC]);
    expect(outline.code).toBe(0);
    expect(outline.out).toBe('view outline\n');
    await cli([
      'text-document',
      'view',
      DOC,
      '--as',
      'text',
      '--lines',
      '--range',
      '2..9',
      '--only',
      'Tab 2',
    ]);
    expect(asked.at(-1)!.path).toBe(
      `/api/documents/${DOC}/tabs/words?view=text&only=Tab+2&range=2..9&lines=1`,
    );
  });

  it('refuses a document without a text document, and a tab it lacks, naming those it has', async () => {
    const bare = await cli(['text', 'view', BARE]);
    expect(bare.code).not.toBe(0);
    expect(bare.err).toContain('Board holds no text document');
    const named = await cli(['text', 'view', DOC, '--tab', 'Nope']);
    expect(named.err).toContain('Launch plan holds no text document tab "Nope"');
    expect(named.err).toContain('tab "Words" words');
  });
});

describe('livedoc text edit', () => {
  it('sends the words as one operation and prints the results and the changeset', async () => {
    const res = await cli(['text', 'edit', DOC, 'edit', '"Q3"', '"Q4"', '--summary', 'move it']);
    expect(res.code).toBe(0);
    expect(asked.at(-1)!.body).toEqual({ ops: 'edit "Q3" "Q4"', summary: 'move it' });
    expect(res.out).toBe(
      [
        'edited ¶1',
        'appended ¶9',
        '~ text changeset tc_0000000001 · 1 added, 1 changed · revert: livedoc changeset revert <doc> tc_0000000001',
        '',
      ].join('\n'),
    );
  });

  it('reads operations from stdin, dry runs, and passes the document tab and base', async () => {
    const res = await cli(
      ['text', 'edit', DOC, '-f', '-', '--dry-run', '--document-tab', 'Tab 2', '--base', 'AQID'],
      { stdin: 'append "x"\nedit "a" "b"\n' },
    );
    expect(res.out).toContain('dry run, nothing written');
    expect(asked.at(-1)).toMatchObject({
      path: `/api/documents/${DOC}/tabs/words/changesets?dryRun=1`,
      body: { ops: 'append "x"\nedit "a" "b"\n', documentTab: 'Tab 2', base: 'AQID' },
    });
  });

  it('names the refused line, and refuses no operation or both kinds', async () => {
    const refused = await cli(['text', 'edit', DOC, '-f', '-'], {
      stdin: 'append "x"\nedit "nowhere" "y"',
    });
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain('line 2: "nowhere" is not in the document tab');
    expect(refused.err).toContain('livedoc text view <doc> --as text --lines');
    const raw = await cli(['text', 'edit', DOC, 'boom']);
    expect(raw.err).toContain('api 400: down');
    const none = await cli(['text', 'edit', DOC]);
    expect(none.err).toContain('give one operation as words, or --file with one a line');
  });
});

describe('livedoc text download', () => {
  it('writes the file in its own format, or the one asked, under its name or --to', async () => {
    const own = await cli(['text', 'download', DOC]);
    expect(own.code).toBe(0);
    expect(own.out).toBe('Launch plan.docx  1 KB\n');
    expect([...own.io.byteMap.get('Launch plan.docx')!]).toEqual([...ODT]);
    const md = await cli(['text', 'download', DOC, '--format', 'md', '--to', 'plan.md']);
    expect(md.out).toBe('plan.md  1 KB\n');
    expect(asked.at(-1)!.path).toBe(`/api/documents/${DOC}/text-documents/words/file?type=md`);
  });

  it('says why the api refused it', async () => {
    const refused = await cli(['text', 'download', DOC, '--format', 'rtf']);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain('The api refused the download (file_type_unknown).');
    const down = await cli(['text', 'download', DOC, '--format', 'epub']);
    expect(down.err).toContain('(http_500)');
  });
});

describe('livedoc text import', () => {
  it('opens a Word file as OOXML and Markdown as an ODF import, named after the file or --name', async () => {
    const word = await cli(['text', 'import', 'Q3 report.docx'], {
      bytes: { '/work/Q3 report.docx': ODT },
    });
    expect(word.code).toBe(0);
    expect(word.out).toMatch(
      /^\+ text-document [0-9a-f]{8} "Q3 report" · docx · https:\/\/docs\.nu\/document\/[0-9a-f-]{36}\n$/,
    );
    expect(asked.at(-1)!.body).toMatchObject({
      name: 'Q3 report',
      tabs: [{ kind: 'text-document', format: 'ooxml', name: 'Q3 report' }],
      textDocuments: [{ file: 'UEsDBAk=' }],
    });
    const md = await cli(['text', 'import', '/n/notes.md', '--name', 'Notes'], {
      bytes: { '/n/notes.md': ODT },
    });
    expect(md.out).toContain('"Notes" · odt ·');
    expect(asked.at(-1)!.body).toMatchObject({
      tabs: [{ format: 'odf' }],
      textDocuments: [{ type: 'md' }],
    });
  });

  it('refuses a missing file and words a file the api refused', async () => {
    const missing = await cli(['text', 'import', 'gone.odt']);
    expect(missing.err).toContain('No file gone.odt.');
    const broken = await cli(['text', 'import', 'x.odt', '--name', 'Broken'], {
      bytes: { '/work/x.odt': ODT },
    });
    expect(broken.err).toContain('This file is damaged and could not be opened.');
  });
});
