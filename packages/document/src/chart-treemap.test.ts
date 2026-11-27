// docs/specs/009-elements/pie-chart.md "Chart types", "Treemap" (D328): a pie's slices as tiles whose areas are in
// proportion to their values, squarified, largest first; none, zero or below no tile; names inside when they fit.
import { describe, expect, it } from 'vitest';
import { chartFieldsFromTable, type SliceFields } from './chart-source';
import { isTreemapChart, treemapLabels, treemapTiles, TREEMAP_GAP } from './chart-treemap';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { PieSlice } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 0, y: 0, w: 600, h: 400 };
const P = (label: string, value: number | null): PieSlice => ({ label, value });
// The classic squarified example (Bruls et al.): 6, 6, 4, 3, 2, 2, 1 on a 6 by 4 rectangle.
const BRULS = [6, 6, 4, 3, 2, 2, 1].map((v, i) => P(`n${i}`, v));

describe('treemap as a chart type', () => {
  it('is a pie chart kind with its own variant, named Treemap', () => {
    expect(chartShapeOf('treemap')).toEqual({ shape: 'pie-chart', chartVariant: 'treemap' });
    expect(chartTypeOf({ shape: 'pie-chart', chartVariant: 'treemap' })).toBe('treemap');
    expect(isTreemapChart({ shape: 'pie-chart', chartVariant: 'treemap' })).toBe(true);
    expect(isTreemapChart({ shape: 'line-chart', chartVariant: 'treemap' })).toBe(false);
    expect(CHART_TYPE_LABELS.treemap).toBe('Treemap');
  });
});

describe('treemapTiles', () => {
  it('gives each value an area in proportion to it, tiling the plot', () => {
    const tiles = treemapTiles(AREA, BRULS);
    const total = 24;
    tiles.forEach((t, i) => {
      const full = (t!.w + TREEMAP_GAP) * (t!.h + TREEMAP_GAP);
      expect(full).toBeCloseTo((BRULS[i]!.value! / total) * AREA.w * AREA.h, 0);
    });
    // Squarified: the first two share the left column, each 6 of 24 of the area.
    expect(tiles[0]!.x).toBeCloseTo(TREEMAP_GAP / 2);
    expect(tiles[1]!.x).toBeCloseTo(TREEMAP_GAP / 2);
    expect(tiles[1]!.y).toBeGreaterThan(tiles[0]!.y);
    const worst = Math.max(...tiles.map((t) => Math.max(t!.w / t!.h, t!.h / t!.w)));
    expect(worst).toBeLessThan(3);
  });

  it('lays a tall plot’s rows along its top, shifted by the offset', () => {
    const tiles = treemapTiles({ x: 0, y: 0, w: 100, h: 300 }, [P('a', 1), P('b', 1)], 10, 20);
    expect(tiles[0]!.y).toBeCloseTo(20 + TREEMAP_GAP / 2);
    expect(tiles[1]!.y).toBeGreaterThan(tiles[0]!.y + tiles[0]!.h);
    expect(tiles[0]!.x).toBeCloseTo(10 + TREEMAP_GAP / 2);
  });

  it('draws no tile for none, zero or below, nor in an empty plot', () => {
    const tiles = treemapTiles(AREA, [P('a', null), P('b', 0), P('c', -2), P('d', 5)]);
    expect(tiles.slice(0, 3)).toEqual([null, null, null]);
    expect(tiles[3]!.w).toBeCloseTo(AREA.w - TREEMAP_GAP);
    expect(treemapTiles(AREA, [P('a', null)])).toEqual([null]);
    expect(treemapTiles({ ...AREA, w: 0 }, [P('a', 1)])).toEqual([null]);
  });
});

describe('treemapLabels', () => {
  it('writes a name, and with values its value, inside a tile that holds them, on its colour', () => {
    const data = [P('Big', 90), P('Tiny name that does not fit', 1), P('', 9), P('Gone', null)];
    const tiles = treemapTiles(AREA, data);
    const labels = treemapLabels(tiles, data, 10, true);
    expect(labels.map((l) => l.text)).toEqual(['Big', '90', '9']);
    expect(labels[0]).toMatchObject({ anchor: 'start', onMark: 0, category: true });
    expect(labels[1]).not.toHaveProperty('category');
    expect(treemapLabels(tiles, data, 10, false).map((l) => l.text)).toEqual(['Big']);
  });
});

const slicesOf = (...args: Parameters<typeof chartFieldsFromTable>) =>
  chartFieldsFromTable(...args) as SliceFields;

describe('a treemap read from a sheet', () => {
  it('reads its first column holding a number, past a text Parent column', () => {
    const fields = slicesOf(
      { shape: 'pie-chart', chartVariant: 'treemap' },
      {
        categories: ['Global', 'Europe', 'Asia'],
        series: [
          { name: 'Parent', values: [null, null, null] },
          { name: 'Size', values: [null, 40, 60] },
        ],
      },
    );
    expect(fields.pieSlices.map((s) => s.value)).toEqual([null, 40, 60]);
    const pie = slicesOf(
      { shape: 'pie-chart' },
      {
        categories: ['a'],
        series: [
          { name: 'P', values: [null] },
          { name: 'S', values: [1] },
        ],
      },
    );
    expect(pie.pieSlices[0]!.value).toBeNull();
    const none = slicesOf(
      { shape: 'pie-chart', chartVariant: 'treemap' },
      { categories: ['a'], series: [] },
    );
    expect(none.pieSlices[0]!.value).toBeNull();
  });
});

describe('the treemap in the export', () => {
  it('draws tiles in their colours with names inside, and the key', () => {
    const el: ShapeElement = {
      ...createShape('pie-chart', 0, 0),
      width: 400,
      height: 300,
      chartVariant: 'treemap',
      chartValues: true,
      pieSlices: [
        { label: 'Europe', value: 40, color: '#aa3300' },
        { label: 'Asia', value: 60 },
        { label: 'None', value: null },
      ],
    };
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg).toContain('fill="#aa3300"/>');
    expect(svg).toContain('>Europe</text>');
    expect(svg).toContain('>60</text>');
    expect(svg).not.toContain('<path d="M');
  });
});
