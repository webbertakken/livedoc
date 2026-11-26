'use client';

// Line, Area, Stepped Area, Scatter, Radar and Combo charts (docs/specs/009-elements/pie-chart.md "Chart types"): a 2-D chart — shared x-axis `lineCategories` and one or
// more named `lineSeries`, each drawn as a polyline with point markers in the
// theme palette, with an optional legend listing the series. Data is edited as
// a grid (or imported from CSV) via the Data menu. Reuses the chart-family
// animation (`pieAnim` -> lvd-pie-*) + legend toggle. The line + point group
// animates; the axes + x-labels stay still.

import { LineChartAxis } from './ChartAxis';
import {
  AREA_FILL_OPACITY,
  chartValueFontPx,
  lineKeyItems,
  lineMarks,
  lineValueLabels,
  lineVariantOf,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  legendFontPx,
  chartValue,
  chartTypeOf,
  chartStackOf,
  comboKeyItems,
  comboMarkAt,
  comboMarks,
  comboValueLabels,
  isComboChart,
  isRadarChart,
  pointsMarked,
  type ShapeElement,
} from '@livedoc/document';

import { useChartAnim, chartFrame } from '@/lib/chart';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { ChartValues } from '@/components/primitives/ChartValues';
import { RadarChartView } from './RadarChartView';

// How far from a step's middle the pointer reads it.
const STEP_HOVER_PX = 6;

type Props = {
  element: ShapeElement;
  fontFamily?: string;
  textColor: string;
  palette?: readonly string[];
  // What the chart sits on (chartPageGrounds): its series drawn adapted to it.
  ground?: readonly string[];
};

// A Radar chart draws around a centre (pie-chart.md "Radar"); every other line chart on its two axes.
export function LineChartView(props: Props) {
  return isRadarChart(props.element) ? (
    <RadarChartView {...props} />
  ) : (
    <PlotLineChartView {...props} />
  );
}

function PlotLineChartView({ element, fontFamily, textColor, palette, ground }: Props) {
  const { w, h, colorAt, area, legend, titles } = chartFrame(element, palette, ground);
  const { hover, markProps } = useChartHover<{ s: number; i: number }>(
    (a, b) => a.s === b.s && a.i === b.i,
  );
  const categories =
    element.lineCategories && element.lineCategories.length > 0
      ? element.lineCategories
      : LINE_DEFAULT_CATEGORIES;
  const series =
    element.lineSeries && element.lineSeries.length > 0 ? element.lineSeries : LINE_DEFAULT_SERIES;
  // A Combo chart's series each as its own type (pie-chart.md "Combo"), on the line chart's axes.
  const combo = isComboChart(element)
    ? comboMarks(
        area,
        categories,
        series,
        0,
        0,
        element.chartAxis === true,
        element.chartSmooth === true,
      )
    : null;
  // Line, Area or Scatter, laid out by the marks the export draws too.
  const m =
    combo ??
    lineMarks(
      area,
      categories,
      series,
      lineVariantOf(element),
      0,
      0,
      element.chartAxis === true,
      // An area chart's stacking (pie-chart.md "Stacking").
      chartStackOf({ ...element, lineSeries: series }),
      // Smooth Line (pie-chart.md "Smooth Line").
      element.chartSmooth === true,
    );
  // The second axis's labels in its first series' colour.
  const right = Math.max(
    0,
    series.findIndex((s) => s.axis === 'right'),
  );
  const { x: plotX0, y: plotY0, w: plotW, h: plotH } = m.plot;
  // Only a drawn point is hovered: no value draws none (pie-chart.md "No value is a gap").
  const hovered = hover
    ? combo
      ? comboMarkAt(combo, hover.s, hover.i)
      : m.points[hover.s]?.[hover.i]
    : null;
  const hoveredValue = hover ? chartValue(series[hover.s]?.values[hover.i]) : null;
  // A named scatter point reads by its name, its value and its x, whatever series it is in (pie-chart.md "Scatter's
  // point names").
  const pointName =
    hover && chartTypeOf(element) === 'scatter' ? element.linePointNames?.[hover.i] : undefined;

  const group = useChartAnim(element, `${plotX0 + plotW / 2}px ${plotY0 + plotH / 2}px`);
  const legendItems = combo ? comboKeyItems(series) : lineKeyItems(series, lineVariantOf(element));

  return (
    <ChartSurface
      w={w}
      h={h}
      items={legendItems}
      colorAt={colorAt}
      legend={legend}
      titles={titles}
      textColor={textColor}
      fontFamily={fontFamily}
      fontPx={legendFontPx(element.textSize)}
      readout={
        hover && hovered && hoveredValue !== null ? (
          <ChartReadout
            leftPct={(hovered.x / w) * 100}
            topPct={(hovered.y / h) * 100}
            {...(pointName
              ? { text: `${pointName}, ${hoveredValue}, ${categories[hover.i]}` }
              : {
                  label: `${categories[hover.i] ?? ''} · ${series[hover.s]?.name ?? ''}`,
                  value: hoveredValue,
                })}
          />
        ) : null
      }
    >
      {/* Axes: Show Axis's ticks and gridlines, then the plot's two edges. */}
      <LineChartAxis
        marks={m}
        rightColor={colorAt(right, series[right] ?? {})}
        textColor={textColor}
        fontFamily={fontFamily}
      />
      <line
        x1={plotX0}
        y1={plotY0}
        x2={plotX0}
        y2={plotY0 + plotH}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      <line
        x1={plotX0}
        y1={plotY0 + plotH}
        x2={plotX0 + plotW}
        y2={plotY0 + plotH}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      <g className={group.className} style={group.style}>
        {/* A Combo chart paints its areas, then its columns, then its lines over them. */}
        {combo
          ? series.map((s, si) =>
              m.areas[si] ? (
                <path
                  key={`a${si}`}
                  d={m.areas[si]}
                  fill={colorAt(si, s)}
                  fillOpacity={AREA_FILL_OPACITY}
                />
              ) : null,
            )
          : null}
        {combo?.bars.map((bars, si) =>
          bars.map((b, i) =>
            b ? (
              <rect
                key={`b${si}-${i}`}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={b.rx}
                fill={colorAt(si, series[si]!)}
                {...markProps({ s: si, i })}
              />
            ) : null,
          ),
        )}
        {series.map((s, si) => {
          const color = colorAt(si, s);
          // A step carries no marker (D289): its point is a clear spot to hover over its middle.
          const marked = pointsMarked(m, si);
          return (
            <g key={si}>
              {m.areas[si] && !combo ? (
                <path d={m.areas[si]} fill={color} fillOpacity={AREA_FILL_OPACITY} />
              ) : null}
              {m.lines[si] ? (
                <path
                  d={m.lines[si]}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {m.points[si]!.map((p, i) =>
                p ? (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={marked ? m.dot : STEP_HOVER_PX}
                    fill={marked ? color : 'transparent'}
                    {...markProps({ s: si, i })}
                  />
                ) : null,
              )}
            </g>
          );
        })}
      </g>
      {/* X-axis labels: the categories, shortened only past the gap to the next one (chartAxisLabel), or a
          scatter's numbers. */}
      {m.labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={plotY0 + plotH + 13}
          textAnchor="middle"
          fontSize={9}
          fill={textColor}
          fontFamily={fontFamily}
        >
          {l.text}
        </text>
      ))}
      {element.chartValues ? (
        <ChartValues
          labels={
            combo
              ? comboValueLabels(combo, series, chartValueFontPx(element.textSize))
              : lineValueLabels(m, series)
          }
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={chartValueFontPx(element.textSize)}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
