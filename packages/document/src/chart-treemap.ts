// Treemap charts (docs/specs/009-elements/pie-chart.md "Treemap", D328): a pie chart's slices drawn as rectangles
// tiling the plot, each's area in proportion to its value, laid out squarified (Bruls, Huizing and van Wijk) so tiles
// stay near square, largest first from the top left. Laid out once for both renderers. Pure; `ox` / `oy` shift it.
import type { ChartRect } from './chart-frame';
import { chartTypeOf } from './chart-types';
import { shortNumber, type ChartValueLabel } from './chart-values';
import { chartValue, type PieSlice } from './data-shapes';
import { glyphWidth } from './graph-authoring';

/** Whether a chart draws as a Treemap. */
export const isTreemapChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'treemap';

// The gap between tiles, and a name's inset from its tile's top-left corner.
export const TREEMAP_GAP = 1;
const INSET = 4;

export type TreemapTile = ChartRect & { tip: { x: number; y: number } };

type Item = { i: number; v: number };

// The worst aspect ratio of a row of `sizes` laid along a side `side` long (the squarified algorithm's measure).
function worst(sizes: readonly number[], side: number): number {
  const sum = sizes.reduce((a, b) => a + b, 0);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/**
 * Each slice's tile in `area`, by slice; null for a value that is none, zero or below (no tile). Values are drawn
 * largest first, each row along the shorter side of what is left.
 */
export function treemapTiles(
  area: ChartRect,
  data: readonly PieSlice[],
  ox = 0,
  oy = 0,
): (TreemapTile | null)[] {
  const tiles: (TreemapTile | null)[] = data.map(() => null);
  const items: Item[] = data
    .map((d, i) => ({ i, v: chartValue(d.value) ?? 0 }))
    .filter((it) => it.v > 0)
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const total = items.reduce((a, it) => a + it.v, 0);
  if (total === 0 || area.w <= 0 || area.h <= 0) return tiles;
  const scale = (area.w * area.h) / total;
  let rect = { x: ox + area.x, y: oy + area.y, w: area.w, h: area.h };
  const place = (row: readonly Item[]) => {
    const sum = row.reduce((a, it) => a + it.v * scale, 0);
    const across = rect.w >= rect.h;
    // A column at the left of a wide rest, else a row along the top.
    const thick = across ? sum / rect.h : sum / rect.w;
    let at = across ? rect.y : rect.x;
    for (const it of row) {
      const long = (it.v * scale) / thick;
      const r = across
        ? { x: rect.x, y: at, w: thick, h: long }
        : { x: at, y: rect.y, w: long, h: thick };
      at += long;
      const g = TREEMAP_GAP / 2;
      const tile = {
        x: r.x + g,
        y: r.y + g,
        w: Math.max(0, r.w - TREEMAP_GAP),
        h: Math.max(0, r.h - TREEMAP_GAP),
      };
      tiles[it.i] = { ...tile, tip: { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 } };
    }
    rect = across
      ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h }
      : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick };
  };
  let row: Item[] = [];
  for (const it of items) {
    const side = Math.min(rect.w, rect.h);
    const sizes = row.map((r) => r.v * scale);
    if (row.length === 0 || worst([...sizes, it.v * scale], side) <= worst(sizes, side)) {
      row.push(it);
      continue;
    }
    place(row);
    row = [it];
  }
  place(row);
  return tiles;
}

/**
 * Each tile's name at its top left, and with Show Values its value under it, in the ink that reads on its colour
 * (`onMark`), when the tile holds the text; a tile too small shows them in its readout only.
 */
export function treemapLabels(
  tiles: readonly (TreemapTile | null)[],
  data: readonly PieSlice[],
  fontPx: number,
  values: boolean,
): ChartValueLabel[] {
  const out: ChartValueLabel[] = [];
  tiles.forEach((t, i) => {
    if (!t) return;
    const room = t.w - INSET * 2;
    const lines = [data[i]!.label, ...(values ? [shortNumber(chartValue(data[i]!.value)!)] : [])];
    // A line that does not fit ends the tile's text, so a value never stands without the name above it.
    let k = 0;
    for (const [n, text] of lines.entries()) {
      const bottom = INSET + (k + 1) * (fontPx + 2);
      if (glyphWidth(text, fontPx) > room || bottom > t.h) return;
      if (!text) continue;
      out.push({
        x: t.x + INSET,
        y: t.y + bottom - 2,
        text,
        anchor: 'start',
        onMark: i,
        // The name in regular weight, its value bold, as a column's name and number read.
        ...(n === 0 ? { category: true } : {}),
      });
      k++;
    }
  });
  return out;
}
