import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMAIN_EXPORT_MAX_PREVIOUS_BYTES } from '@livedoc/storm-reading';
import {
  DEFAULT_DOMAIN_LANGUAGE,
  domainExportZip,
  readEarlierExport,
  rememberLanguage,
  rememberedLanguage,
  requestDomainExport,
} from './domain-export';
import { listZip } from './zip-reader';
import { writeZip } from './zip-writer';

// The editor's half of the zip export (docs/specs/021-event-storming/domain-export.md "The zip").

vi.mock('@/lib/api/core', () => ({
  API_BASE: '/api',
  apiFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  apiHeaders: async (_owner: string, opts: { share?: string | null }) => ({
    'X-Owner-Id': 'me',
    ...(opts.share ? { 'X-Share-Code': opts.share } : {}),
  }),
}));

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const zipOf = (files: Record<string, string>) =>
  writeZip(
    Object.entries(files).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })),
  );

describe('the remembered language', () => {
  it('starts on TypeScript and remembers the last pick per board', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(rememberedLanguage('t1', storage)).toBe(DEFAULT_DOMAIN_LANGUAGE);
    rememberLanguage('t1', 'go', storage);
    expect(rememberedLanguage('t1', storage)).toBe('go');
    expect(rememberedLanguage('t2', storage)).toBe('typescript');
    store.set('livedoc:v2:storm-export-language:t3', 'cobol');
    expect(rememberedLanguage('t3', storage)).toBe('typescript');
  });

  it('survives a store that refuses or is absent', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(rememberedLanguage('t', broken)).toBe('typescript');
    expect(() => rememberLanguage('t', 'go', broken)).not.toThrow();
    expect(rememberedLanguage('t', null)).toBe('typescript');
    rememberLanguage('t', 'go', null);
  });
});

describe('readEarlierExport', () => {
  it('reads every text file, skipping folders', async () => {
    const bytes = writeZip([
      { name: 'livedoc/', data: new Uint8Array() },
      { name: 'livedoc/storm.json', data: new TextEncoder().encode('{"a":1}') },
      { name: 'src/a.ts', data: new TextEncoder().encode('export {}') },
    ]);
    expect(await readEarlierExport(bytes)).toEqual({
      ok: true,
      files: { 'livedoc/storm.json': '{"a":1}', 'src/a.ts': 'export {}' },
    });
  });

  it('refuses a file that is no zip, and one past the size an export may update', async () => {
    expect(await readEarlierExport(new Uint8Array([1, 2, 3]))).toEqual({
      ok: false,
      error: 'previous_unreadable',
    });
    const big = zipOf({ 'src/big.ts': 'x'.repeat(DOMAIN_EXPORT_MAX_PREVIOUS_BYTES + 1) });
    expect(await readEarlierExport(big)).toEqual({ ok: false, error: 'previous_too_large' });
  });

  it('refuses a damaged entry', async () => {
    const bytes = zipOf({ 'src/a.ts': 'export {}' });
    // Break the entry's local header signature.
    bytes[0] = 0;
    expect(await readEarlierExport(bytes)).toEqual({ ok: false, error: 'previous_unreadable' });
  });
});

describe('requestDomainExport', () => {
  const input = {
    ownerId: 'me',
    share: 'code',
    documentId: 'd 1',
    tabId: 't',
    language: 'go' as const,
    previous: null,
    signal: new AbortController().signal,
  };

  it('posts the language and the earlier export, and answers the files', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ files: { 'README.md': 'hi' }, written: false }),
    );
    globalThis.fetch = fetchMock;
    const result = await requestDomainExport({
      ...input,
      previous: { 'src/a.ts': 'x' },
      bundleOnly: true,
    });
    expect(result).toEqual({ ok: true, files: { 'README.md': 'hi' }, written: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/d%201/tabs/t/storm-export');
    expect(JSON.parse(init.body as string)).toEqual({
      language: 'go',
      previous: { 'src/a.ts': 'x' },
      bundleOnly: true,
    });
    expect(init.headers).toMatchObject({ 'X-Share-Code': 'code' });
  });

  it('answers a refusal as its error token', async () => {
    globalThis.fetch = async () => Response.json({ error: 'ai_failed' }, { status: 502 });
    expect(await requestDomainExport(input)).toEqual({ ok: false, error: 'ai_failed' });
    globalThis.fetch = async () => new Response('<html>', { status: 502 });
    expect(await requestDomainExport(input)).toEqual({ ok: false, error: 'export_failed' });
  });
});

describe('domainExportZip', () => {
  it('writes the files in order into a zip', async () => {
    const blob = domainExportZip({ 'README.md': 'hi', 'livedoc/storm.md': 'board' });
    expect(blob.type).toBe('application/zip');
    const listed = listZip(new Uint8Array(await blob.arrayBuffer()));
    expect(listed.ok && listed.entries.map((e) => e.name)).toEqual([
      'README.md',
      'livedoc/storm.md',
    ]);
  });
});
