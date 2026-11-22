// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Unknown content), D113, D114: a spreadsheet's kept content
// sent fitted to its sizes in requests of their own, in order, a refusal stopping the rest; read whole.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keptToWire } from '@livedoc/api-schema/workbook-kept';
import { KEPT_PART_MAX_BYTES, type KeptContent, type StoredAt } from '@livedoc/sheets/files';
import { fetchKept, sendKept } from './workbook-kept';

const scope = { documentId: 'd 1', ownerId: 'o', shareCode: null };
const kept: KeptContent<StoredAt> = {
  standard: 'odf',
  items: [{ place: 'spreadsheet-after', xml: '<table:x/>', ns: { table: 'urn:t' }, at: {} }],
  relationships: [],
  parts: [{ name: 'Pictures/a.png', type: 'image/png', data: new Uint8Array([1]), rels: [] }],
};
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('sendKept', () => {
  it('posts the content fitted to its sizes, in order, and counts what was left out', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => answer({}));
    vi.stubGlobal('fetch', f);
    const big = {
      name: 'Pictures/big.png',
      type: '',
      data: new Uint8Array(KEPT_PART_MAX_BYTES + 1),
      rels: [],
    };
    expect(await sendKept(scope, { ...kept, parts: [...kept.parts, big] })).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain('/documents/d%201/workbook/kept');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(keptToWire(kept));
  });

  it('stops at a refusal and throws it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ error: 'kept_item_invalid' }, 400)),
    );
    await expect(sendKept(scope, kept)).rejects.toMatchObject({ code: 'kept_item_invalid' });
  });
});

describe('fetchKept', () => {
  it('reads the content whole, or none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ kept: keptToWire(kept) })),
    );
    expect(await fetchKept(scope)).toEqual(kept);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ kept: null })),
    );
    expect(await fetchKept(scope)).toBeUndefined();
  });

  it('surfaces an answer that is not kept content, and a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ kept: { standard: 'pdf' } })),
    );
    await expect(fetchKept(scope)).rejects.toThrow('kept content unreadable');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ error: 'workbook_not_found' }, 404)),
    );
    await expect(fetchKept(scope)).rejects.toMatchObject({ code: 'workbook_not_found' });
  });
});
