// docs/specs/029-sheets/standard-mapping.md "Unknown content", D113: the sizes a spreadsheet stores, what is past them
// left out, entries first, with the relationships naming them, and counted.
import { describe, expect, it } from 'vitest';
import type { KeptContent, KeptItem, KeptPart, KeptRelationship } from './kept-content';
import {
  KEPT_ITEM_MAX_BYTES,
  KEPT_MAX_BYTES,
  KEPT_PART_MAX_BYTES,
  keptBytes,
  keptWithinSizes,
} from './kept-sizes';

const MB = 1024 * 1024;
const item = (bytes: number, xml = 'a'): KeptItem<object> => ({
  place: 'worksheet',
  xml: `<${xml.repeat(Math.max(1, bytes - 5))}/>`,
  ns: {},
  at: {},
});
const part = (name: string, bytes: number, rels: KeptPart['rels'] = []): KeptPart => ({
  name,
  type: '',
  data: new Uint8Array(bytes),
  rels,
});
const rel = (target: string, external = false): KeptRelationship<object> => ({
  id: 'rId1',
  type: 't',
  target,
  ...(external ? { external } : {}),
  from: 'workbook',
  at: {},
});
const content = (more: Partial<KeptContent<object>>): KeptContent<object> => ({
  standard: 'ooxml',
  items: [],
  parts: [],
  relationships: [],
  ...more,
});

describe('keptBytes', () => {
  it('weighs items, relationships and entries with their names and types', () => {
    const kept = content({
      items: [{ place: 'worksheet', xml: '<é/>', ns: { x: 'u' }, at: {} }],
      relationships: [rel('/a')],
      parts: [part('a', 10, [{ id: 'r', type: 't', target: 'b' }])],
    });
    // '<é/>' 5 + '{"x":"u"}' 9; 'rId1' 4 + 't' 1 + '/a' 2; 10 + 'a' 1 + '' 0 + 'r' 1 + 't' 1 + 'b' 1.
    expect(keptBytes(kept)).toBe(14 + 7 + 14);
  });
});

describe('keptWithinSizes', () => {
  it('keeps content within the sizes whole', () => {
    const kept = content({ items: [item(100)], parts: [part('xl/media/a.png', 100)] });
    expect(keptWithinSizes(kept)).toEqual({ kept, left: 0 });
  });

  it('leaves out an item or an entry past its own size', () => {
    const kept = content({
      items: [item(KEPT_ITEM_MAX_BYTES + 1), item(10)],
      parts: [part('xl/media/big.png', KEPT_PART_MAX_BYTES + 1), part('xl/media/a.png', 10)],
    });
    const fitted = keptWithinSizes(kept);
    expect(fitted.left).toBe(2);
    expect(fitted.kept.items).toEqual([kept.items[1]]);
    expect(fitted.kept.parts.map((p) => p.name)).toEqual(['xl/media/a.png']);
  });

  it('leaves out entries first, the largest first, with the relationships naming them', () => {
    const big = Array.from({ length: 4 }, (_, i) => part(`xl/media/${i}.png`, 4 * MB + i));
    const drawing = part('xl/drawings/d.xml', 10, [
      { id: 'rId1', type: 't', target: '../media/3.png' },
      { id: 'rId2', type: 't', target: '../media/0.png' },
      { id: 'rId3', type: 't', target: 'https://x', external: true },
    ]);
    const kept = content({
      items: [item(10)],
      parts: [...big, drawing],
      relationships: [rel('/xl/media/3.png'), rel('/xl/media/1.png'), rel('https://y', true)],
    });
    const fitted = keptWithinSizes(kept);
    expect(fitted.kept.parts.map((p) => p.name)).toEqual([
      'xl/media/0.png',
      'xl/media/1.png',
      'xl/media/2.png',
      'xl/drawings/d.xml',
    ]);
    expect(fitted.kept.parts[3]!.rels.map((r) => r.id)).toEqual(['rId2', 'rId3']);
    expect(fitted.kept.parts[0]).toBe(big[0]);
    expect(fitted.kept.relationships.map((r) => r.target)).toEqual([
      '/xl/media/1.png',
      'https://y',
    ]);
    expect(fitted.left).toBe(2);
    expect(keptBytes(fitted.kept)).toBeLessThanOrEqual(KEPT_MAX_BYTES);
  });

  it('leaves out items from the last once no entry is left to go', () => {
    const items = Array.from({ length: 17 }, () => item(MB - 100));
    const fitted = keptWithinSizes(content({ items, parts: [part('xl/media/a.png', 10)] }));
    expect(fitted.kept.parts).toEqual([]);
    expect(fitted.kept.items).toHaveLength(16);
    expect(fitted.left).toBe(2);
  });
});
