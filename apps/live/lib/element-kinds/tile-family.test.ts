import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaletteTileDef } from '@/components/palette/palette-tile-defs';

const loaded = new Set<string>();
const outcome = new Map<string, boolean>();
const asked: [string, string][] = [];
let release: () => void = () => {};
vi.mock('./store', () => ({
  isKindFamilyLoaded: (id: string) => loaded.has(id),
  loadKindFamily: vi.fn((id: string, reason: string) => {
    asked.push([id, reason]);
    return new Promise<boolean>((resolve) => {
      release = () => resolve(outcome.get(id) ?? true);
    });
  }),
}));

const { kindFamilyOfTile, prefetchTileKindFamily, withKindFamily } = await import('./tile-family');

type Action = PaletteTileDef['action'];
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  loaded.clear();
  outcome.clear();
  asked.length = 0;
});

describe('kindFamilyOfTile', () => {
  it.each<[Action, string | null]>([
    [{ type: 'shape', kind: 'reveal' }, 'session-controls'],
    [{ type: 'shape', kind: 'square' }, null],
    [{ type: 'video' }, 'embeds'],
    [{ type: 'link-card' }, 'embeds'],
    [{ type: 'component', kind: 'hero' }, 'web-components'],
    [{ type: 'component', kind: 'banner' }, 'web-components'],
    [{ type: 'component', kind: 'avatar' }, null],
    [{ type: 'component', kind: 'flowchart' }, null],
    [{ type: 'text' }, null],
    [{ type: 'annotation' }, null],
  ])('places %j in %s', (action, family) => {
    expect(kindFamilyOfTile(action)).toBe(family);
  });
});

describe('prefetchTileKindFamily', () => {
  it('fetches the family of what a tile places', () => {
    prefetchTileKindFamily({ type: 'video' });
    expect(asked).toEqual([['embeds', 'palette']]);
  });

  it('fetches nothing for a base tile', () => {
    prefetchTileKindFamily({ type: 'text' });
    expect(asked).toEqual([]);
  });
});

describe('withKindFamily', () => {
  it('hands a base tile its own press', () => {
    const press = vi.fn();
    expect(withKindFamily({ type: 'text' }, press)).toBe(press);
  });

  it('places at once when the family is in', () => {
    loaded.add('embeds');
    const press = vi.fn();
    withKindFamily({ type: 'video' }, press)();
    expect(press).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([]);
  });

  it('places once the family lands', async () => {
    const press = vi.fn();
    withKindFamily({ type: 'shape', kind: 'agenda' }, press)();
    expect(press).not.toHaveBeenCalled();
    expect(asked).toEqual([['collab-panels', 'palette']]);
    release();
    await flush();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('places nothing when the family cannot load', async () => {
    outcome.set('embeds', false);
    const press = vi.fn();
    withKindFamily({ type: 'link-card' }, press)();
    release();
    await flush();
    expect(press).not.toHaveBeenCalled();
  });
});
