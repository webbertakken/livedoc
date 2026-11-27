'use client';

// A Treemap chart (docs/specs/009-elements/pie-chart.md "Treemap", D328): each slice a tile whose area is in proportion
// to its value, its name (and with Show Values its value) inside when it fits, the pie's key. Laid out by the tiles the
// export draws too (`treemapTiles`).

import {
  chartValue,
  chartValueFontPx,
  legendFontPx,
  treemapLabels,
  treemapTiles,
  type ShapeElement,
} from '@livedoc/document';
import { ChartValues } from '@/components/primitives/ChartValues';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { chartFrame, useChartAnim } from '@/lib/chart';

export function TreemapChartView({
  element,
  fontFamily,
  textColor,
  palette,
  ground,
}: {
  element: ShapeElement;
  fontFamily?: string;
  textColor: string;
  palette?: readonly string[];
  ground?: readonly string[];
}) {
  const { w, h, data, colorAt, area, legend, titles } = chartFrame(element, palette, ground);
  const { hover, markProps } = useChartHover<number>();
  const tiles = treemapTiles(area, data);
  const valuePx = chartValueFontPx(element.textSize);
  const group = useChartAnim(element, `${area.x + area.w / 2}px ${area.y + area.h / 2}px`);
  const hovered = hover === null ? null : tiles[hover];
  const hoveredValue = hover === null ? null : chartValue(data[hover]?.value);

  return (
    <ChartSurface
      w={w}
      h={h}
      items={data}
      colorAt={colorAt}
      legend={legend}
      titles={titles}
      textColor={textColor}
      fontFamily={fontFamily}
      fontPx={legendFontPx(element.textSize)}
      readout={
        hover !== null && hovered && hoveredValue !== null ? (
          <ChartReadout
            leftPct={(hovered.tip.x / w) * 100}
            topPct={(hovered.tip.y / h) * 100}
            label={data[hover]!.label}
            value={hoveredValue}
          />
        ) : null
      }
    >
      <g className={group.className} style={group.style}>
        {tiles.map((t, i) =>
          t ? (
            <rect
              key={i}
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              fill={colorAt(i, data[i]!)}
              {...markProps(i)}
            />
          ) : null,
        )}
      </g>
      <ChartValues
        labels={treemapLabels(tiles, data, valuePx, element.chartValues === true)}
        textColor={textColor}
        fillOf={(i) => colorAt(i, data[i]!)}
        fontPx={valuePx}
        fontFamily={fontFamily}
      />
    </ChartSurface>
  );
}
