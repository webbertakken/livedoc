import { describe, expect, it } from 'vitest';
import { MORPH_TARGETS, searchMorphTargets } from './shape-morph-targets';

// docs/specs/008-canvas/canvas-and-palette.md "Shape": the kinds a shape can become, found by the palette's words.

describe('shape morph targets', () => {
  it('offers plain labelled shapes, the mind node among them', () => {
    const kinds = MORPH_TARGETS.map((t) => t.kind);
    expect(kinds).toEqual(expect.arrayContaining(['square', 'circle', 'mind-node', 'cloud']));
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('leaves out what carries its own data, face or picture', () => {
    const kinds = new Set<string>(MORPH_TARGETS.map((t) => t.kind));
    for (const kind of [
      'icon',
      'sticker',
      'frame',
      'tab-window',
      'progress-bar',
      'chair',
      'lane',
      'page',
    ])
      expect(kinds.has(kind)).toBe(false);
  });

  it('finds the mind node by its name', () => {
    expect(searchMorphTargets('mind').map((t) => t.kind)).toContain('mind-node');
  });

  it('finds nothing for words no shape carries, and everything for no words', () => {
    expect(searchMorphTargets('zzzqqq')).toEqual([]);
    expect(searchMorphTargets('  ')).toEqual(MORPH_TARGETS);
  });
});
