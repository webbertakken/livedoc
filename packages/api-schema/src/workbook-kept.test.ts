// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content, D114: kept content on the wire, read back
// only as kept content, and sent in requests of up to KEPT_REQUEST_BYTES each.
import type { KeptContent, StoredAt } from '@livedoc/sheets/files';
import { describe, expect, it } from 'vitest';
import { KEPT_REQUEST_BYTES, keptBatches, keptFromWire, keptToWire } from './workbook-kept';

const kept: KeptContent<StoredAt> = {
  standard: 'ooxml',
  items: [
    { place: 'worksheet', xml: '<drawing r:id="rId1"/>', ns: { r: 'urn:r' }, at: { sheet: 's1' } },
    { place: 'workbook', xml: '<calcPr/>', ns: {}, at: {} },
  ],
  relationships: [
    { id: 'rId1', type: 't', target: '/xl/drawings/d.xml', from: 'sheet', at: { sheet: 's1' } },
    { id: 'rId2', type: 't', target: 'https://x', external: true, from: 'workbook', at: {} },
  ],
  parts: [
    { name: 'xl/media/a.png', type: 'image/png', data: new Uint8Array([0, 1, 255]), rels: [] },
    {
      name: 'xl/drawings/d.xml',
      type: 'x',
      data: new Uint8Array(),
      rels: [{ id: 'rId1', type: 't', target: '../media/a.png', external: false }],
    },
  ],
};

describe('keptToWire and keptFromWire', () => {
  it('carries kept content there and back, entries as base64', () => {
    const wire = keptToWire(kept);
    expect(wire.parts[0]!.data).toBe('AAH/');
    const back = keptFromWire(JSON.parse(JSON.stringify(wire)));
    expect(back).toEqual({
      ...kept,
      parts: [
        kept.parts[0],
        { ...kept.parts[1], rels: [{ id: 'rId1', type: 't', target: '../media/a.png' }] },
      ],
    });
  });

  it('keeps only the fields kept content has', () => {
    const wire = { ...keptToWire(kept), extra: 1 };
    wire.items = [{ ...wire.items[0]!, at: { sheet: 's1', more: 'x' } as StoredAt }];
    expect(keptFromWire(wire)?.items[0]!.at).toEqual({ sheet: 's1' });
  });

  it('refuses what is not kept content', () => {
    const wire = keptToWire(kept);
    const bad = (more: object) => keptFromWire({ ...wire, ...more });
    expect(keptFromWire(null)).toBeNull();
    expect(keptFromWire([])).toBeNull();
    expect(bad({ standard: 'pdf' })).toBeNull();
    expect(bad({ items: {} })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], place: 'nowhere' }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], xml: 1 }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], ns: { r: 1 } }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], ns: [] }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], at: { r: 1 } }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], at: { c: 1 } }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], at: { sheet: 1 } }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], at: null }] })).toBeNull();
    expect(bad({ items: [{ ...wire.items[0], at: { r: 'r', c: 'c' } }] })?.items[0]!.at).toEqual({
      r: 'r',
      c: 'c',
    });
    expect(bad({ items: [7] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], from: 'cell' }] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], at: 3 }] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], id: 3 }] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], type: 3 }] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], target: 3 }] })).toBeNull();
    expect(bad({ relationships: [{ ...wire.relationships[0], external: 'yes' }] })).toBeNull();
    expect(bad({ relationships: [7] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], data: '%%' }] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], data: 1 }] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], name: 1 }] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], type: 1 }] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], rels: {} }] })).toBeNull();
    expect(bad({ parts: [{ ...wire.parts[0], rels: [7] }] })).toBeNull();
    expect(bad({ parts: [7] })).toBeNull();
  });
});

describe('keptBatches', () => {
  it('sends nothing for nothing kept, and small content in one request', () => {
    expect(keptBatches({ ...kept, items: [], relationships: [], parts: [] })).toEqual([]);
    expect(keptBatches(kept)).toEqual([keptToWire(kept)]);
  });

  it('splits content into requests of up to KEPT_REQUEST_BYTES, in order, one large entry alone', () => {
    const big = (name: string, bytes: number) => ({
      name,
      type: '',
      data: new Uint8Array(bytes),
      rels: [],
    });
    const third = Math.floor((KEPT_REQUEST_BYTES * 3) / 4 / 3);
    const batches = keptBatches({
      ...kept,
      parts: [big('a', third), big('b', third), big('c', third), big('d', KEPT_REQUEST_BYTES)],
    });
    expect(batches.map((b) => b.parts.map((p) => p.name))).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(batches[0]!.items).toHaveLength(2);
    expect(batches[0]!.relationships).toHaveLength(2);
    expect(batches.every((b) => b.standard === 'ooxml')).toBe(true);
  });
});
