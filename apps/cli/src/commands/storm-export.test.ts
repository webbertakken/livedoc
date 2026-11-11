import { describe, expect, it } from 'vitest';
import { readBoard } from '@livedoc/storm-reading';
import type { Element } from '@livedoc/document';
import { run } from '../main';
import { fakeIo, NOW, TOKEN, type Route } from '../testing/fake-io';

// `storm export` (docs/specs/021-event-storming/domain-export.md "The CLI"): the bundle written into the repository,
// iterating on an earlier one, the language from --lang, the last export or the project files.

const DOC = 'aaaa1111-0000-4000-8000-000000000002';
const HOST = 'https://docs.nu';
const note = (id: string, esKind: string, x: number, label: string): Element =>
  ({ id, type: 'sticky', x, y: 0, width: 200, height: 200, label, esKind }) as Element;
let elements: Element[] = [
  note('c', 'command', 0, 'Place Order'),
  note('e', 'domain-event', 216, 'Order Placed'),
];

const host: Route = (_r, url) => {
  const path = url.pathname;
  if (path === '/api/capabilities')
    return Response.json({ apiBase: `${HOST}/api`, authEnabled: true, documentFormat: 2 });
  if (path === '/api/teams') return Response.json({ teams: [] });
  if (path === '/api/documents')
    return Response.json({ documents: [{ id: DOC, name: 'Shop', savedAt: NOW, ownerId: 'u' }] });
  if (path === `/api/documents/${DOC}`)
    return Response.json({
      document: {
        id: DOC,
        name: 'Shop',
        presentation: null,
        tabs: [{ id: 'es', name: 'Order Flow', orderIndex: 0 }],
      },
    });
  if (path === `/api/documents/${DOC}/tabs/es` && url.searchParams.get('view') === 'storm')
    return Response.json({
      reading: readBoard({ id: 'es', name: 'Order Flow', elements }),
      suggestions: [],
      rev: 4,
    });
  return undefined;
};

const DIR = '/work/.livedoc/storm/order-flow';

async function cli(argv: string[], files: Record<string, string> = {}) {
  const io = fakeIo({ env: { LIVEDOC_TOKEN: TOKEN }, routes: [host], files });
  const code = await run(argv, io);
  const file = (name: string) => io.fileMap.get(`${DIR}/${name}`)?.data;
  return { code, out: io.out(), err: io.err(), file, io };
}

describe('storm export', () => {
  it('writes a first export, naming the language a project file says', async () => {
    elements = [
      note('c', 'command', 0, 'Place Order'),
      note('e', 'domain-event', 216, 'Order Placed'),
    ];
    const result = await cli(['storm', 'export', DOC], { '/work/go.mod': 'module shop' });
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${DIR}  2 notes · 1 gap · first export`);
    expect(result.out).toContain('language go (go.mod at its root)');
    expect(result.out).toContain(`next: follow ${DIR}/CONVERT.md`);
    expect(result.file('CONVERT.md')).toContain('domain types** in Go');
    expect(JSON.parse(result.file('export.json')!)).toMatchObject({
      board: { documentId: DOC, tabId: 'es', name: 'Order Flow', rev: 4 },
      language: 'go',
      livedoc: expect.any(String),
    });
    expect(result.file('CHANGES.md')).toBeUndefined();
  });

  it('iterates on an earlier export: CHANGES.md and the language it used', async () => {
    elements = [
      note('c', 'command', 0, 'Place Order'),
      note('e', 'domain-event', 216, 'Order Placed'),
    ];
    const first = await cli(['storm', 'export', DOC, '--lang', 'rust']);
    elements = [
      note('c', 'command', 0, 'Submit Order'),
      note('e', 'domain-event', 216, 'Order Placed'),
    ];
    const kept = Object.fromEntries([...first.io.fileMap].map(([path, f]) => [path, f.data]));
    const second = await cli(['storm', 'export', DOC], { ...kept, '/work/package.json': '{}' });
    expect(second.code).toBe(0);
    expect(second.out).toContain('· 1 change');
    expect(second.out).toContain('language rust (the last export)');
    expect(second.file('CHANGES.md')).toContain('- command c "Submit Order", was "Place Order"');
  });

  it('refuses when the repository does not say which language', async () => {
    const result = await cli(['storm', 'export', DOC], {
      '/work/Cargo.toml': '',
      '/work/pyproject.toml': '',
    });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('python and rust');
    expect(result.err).toContain('--lang');
  });
});
