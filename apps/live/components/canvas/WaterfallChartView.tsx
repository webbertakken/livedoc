'use client';

// A Waterfall chart (docs/specs/009-elements/pie-chart.md "Waterfall", D326): the first series as changes to a running
// total, each a floating column (rises in the series' colour, falls red), the Subtotal column grey,
// connectors between them, the three keys. Laid out by the marks the export draws too (`waterfallMarks`).

import {
  BAR_GROUP_NAME_FONT_PX,
  barGroupValueLabels,
  chartValueFontPx,
  legendFontPx,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  waterfallKeys,
  waterfallMarks,
  waterfallReadout,
  type ShapeElement,
} from '@livedoc/document';
import { ChartValues } from '@/components/primitives/ChartValues';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { chartFrame, useChartAnim } from '@/lib/chart';
import { BarChartAxis } from './ChartAxis';

// A connector's ink: the axis's faint grey (svg-render-waterfall.ts WATERFALL_CONNECTOR).
const CONNECTOR = '#94a3b8';

export function WaterfallChartView({
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
  const { w, h, colorAt, area, legend, titles } = chartFrame(element, palette, ground);
  const { hover, markProps } = useChartHover<number>();
  const categories =
    element.lineCategories && element.lineCategories.length > 0
      ? element.lineCategories
      : LINE_DEFAULT_CATEGORIES;
  const series =
    element.lineSeries && element.lineSeries.length > 0 ? element.lineSeries : LINE_DEFAULT_SERIES;
  const marks = waterfallMarks(area, categories, series, 0, 0, element.chartAxis === true);
  const keys = waterfallKeys(series);
  const { baseline, bars, origin } = marks;
  const valuePx = chartValueFontPx(element.textSize);
  const group = useChartAnim(element, `${origin.x}px ${origin.y}px`);
  const hovered = hover === null ? null : bars.map((row) => row[hover]).find(Boolean);

  return (
    <ChartSurface
      w={w}
      h={h}
      items={keys}
      colorAt={colorAt}
      legend={legend}
      titles={titles}
      textColor={textColor}
      fontFamily={fontFamily}
      fontPx={legendFontPx(element.textSize)}
      readout={
        hover !== null && hovered ? (
          <ChartReadout
            leftPct={(hovered.tip.x / w) * 100}
            topPct={(hovered.tip.y / h) * 100}
            text={waterfallReadout(marks, series, hover)}
          />
        ) : null
      }
    >
      <BarChartAxis
        marks={marks}
        horizontal={false}
        textColor={textColor}
        fontFamily={fontFamily}
      />
      <line
        x1={baseline.x1}
        y1={baseline.y1}
        x2={baseline.x2}
        y2={baseline.y2}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {marks.connectors.map((c, i) => (
        <line key={i} x1={c.x1} y1={c.y} x2={c.x2} y2={c.y} stroke={CONNECTOR} strokeWidth={1} />
      ))}
      <g className={group.className} style={group.style}>
        {bars.map((row, k) =>
          row.map((bar, i) =>
            bar ? (
              <rect
                key={`${k}-${i}`}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={Math.max(1, bar.h)}
                fill={colorAt(k, keys[k]!)}
                {...markProps(i)}
              />
            ) : null,
          ),
        )}
      </g>
      <ChartValues
        labels={marks.names}
        textColor={textColor}
        fillOf={() => textColor}
        fontPx={BAR_GROUP_NAME_FONT_PX}
        fontFamily={fontFamily}
      />
      {element.chartValues ? (
        <ChartValues
          labels={barGroupValueLabels({ ...marks, stack: null }, marks.rows, false, valuePx)}
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={valuePx}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
