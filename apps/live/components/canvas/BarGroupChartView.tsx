'use client';

// A column or bar chart of several series (docs/specs/009-elements/pie-chart.md "Several series on a column or bar
// chart", D281): each category a group of bars side by side, one per series in its colour, the category named under
// (beside) its group, the key naming the series. Laid out by the marks the export draws too (`barGroupMarks`).

import {
  BAR_GROUP_NAME_FONT_PX,
  barGroupMarks,
  barGroupValueLabels,
  chartTypeOf,
  chartValue,
  chartValueFontPx,
  legendFontPx,
  shortNumber,
  type ShapeElement,
} from '@livedoc/document';
import { ChartValues } from '@/components/primitives/ChartValues';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { chartFrame, useChartAnim } from '@/lib/chart';
import { BarChartAxis } from './ChartAxis';

type Mark = { s: number; c: number };
const sameMark = (a: Mark, b: Mark) => a.s === b.s && a.c === b.c;

export function BarGroupChartView({
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
  const { hover, markProps } = useChartHover<Mark>(sameMark);
  const horizontal = chartTypeOf(element) === 'bar';
  const categories = element.lineCategories ?? [];
  const series = element.lineSeries ?? [];
  const marks = barGroupMarks(
    area,
    categories,
    series,
    horizontal,
    0,
    0,
    element.chartAxis === true,
  );
  const { baseline, bars, origin } = marks;
  const valuePx = chartValueFontPx(element.textSize);
  const group = useChartAnim(element, `${origin.x}px ${origin.y}px`);
  const keys = series.map((s) => ({ label: s.name, ...(s.color ? { color: s.color } : {}) }));
  const hovered = hover === null ? null : bars[hover.s]?.[hover.c];
  const hoveredValue = hover === null ? null : chartValue(series[hover.s]?.values[hover.c]);

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
        hover !== null && hovered && hoveredValue !== null ? (
          <ChartReadout
            leftPct={(hovered.tip.x / w) * 100}
            topPct={(hovered.tip.y / h) * 100}
            // The line chart's readout (D106): category · series: value.
            text={`${categories[hover.c] || '—'} · ${series[hover.s]!.name}: ${shortNumber(hoveredValue)}`}
          />
        ) : null
      }
    >
      <BarChartAxis
        marks={marks}
        horizontal={horizontal}
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
      <g className={group.className} style={group.style}>
        {bars.map((row, s) =>
          row.map((bar, c) =>
            bar ? (
              <rect
                key={`${s}-${c}`}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={bar.rx}
                fill={colorAt(s, series[s]!)}
                {...markProps({ s, c })}
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
          labels={barGroupValueLabels(marks, series, horizontal, valuePx)}
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={valuePx}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
