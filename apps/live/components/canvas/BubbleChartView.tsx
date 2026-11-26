'use client';

// A Bubble chart (docs/specs/009-elements/pie-chart.md "Bubble", D293): a scatter's axes, each point a circle whose
// area is in proportion to its size (the last of two or more series), filled at 60%, largest first, names inside
// where they fit, from the marks the export draws too (bubbleMarks). A bubble's readout reads `name, y, x, size` when
// named, else `x · series: y, size`.
import {
  BUBBLE_FILL_OPACITY,
  BUBBLE_NAME_FONT_PX,
  bubbleMarks,
  bubbleNames,
  bubbleReadout,
  bubbleValueLabels,
  chartValueFontPx,
  labelOn,
  legendFontPx,
  lineKeyItems,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  type ShapeElement,
} from '@livedoc/document';
import { useChartAnim, chartFrame } from '@/lib/chart';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { ChartValues } from '@/components/primitives/ChartValues';
import { LineChartAxis } from './ChartAxis';

export function BubbleChartView({
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
  const { hover, markProps } = useChartHover<{ s: number; i: number }>(
    (a, b) => a.s === b.s && a.i === b.i,
  );
  const categories =
    element.lineCategories && element.lineCategories.length > 0
      ? element.lineCategories
      : LINE_DEFAULT_CATEGORIES;
  const series =
    element.lineSeries && element.lineSeries.length > 0 ? element.lineSeries : LINE_DEFAULT_SERIES;
  const m = bubbleMarks(area, categories, series, 0, 0, element.chartAxis === true);
  const hovered = hover ? m.points[hover.s]?.[hover.i] : null;
  const { x: plotX0, y: plotY0, w: plotW, h: plotH } = m.plot;
  const group = useChartAnim(element, `${plotX0 + plotW / 2}px ${plotY0 + plotH / 2}px`);
  const fontPx = chartValueFontPx(element.textSize);

  return (
    <ChartSurface
      w={w}
      h={h}
      items={lineKeyItems(m.drawn, 'line')}
      colorAt={colorAt}
      legend={legend}
      titles={titles}
      textColor={textColor}
      fontFamily={fontFamily}
      fontPx={legendFontPx(element.textSize)}
      readout={
        hover && hovered ? (
          <ChartReadout
            leftPct={(hovered.x / w) * 100}
            topPct={(hovered.y / h) * 100}
            text={bubbleReadout(categories, series, element.linePointNames, hover.s, hover.i)}
          />
        ) : null
      }
    >
      <LineChartAxis
        marks={m}
        rightColor={textColor}
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
        {m.bubbles.map((b) => {
          const color = colorAt(b.s, m.drawn[b.s]!);
          return (
            <circle
              key={`${b.s}-${b.i}`}
              cx={b.x}
              cy={b.y}
              r={b.r}
              fill={color}
              fillOpacity={BUBBLE_FILL_OPACITY}
              stroke={color}
              strokeWidth={1}
              {...markProps({ s: b.s, i: b.i })}
            />
          );
        })}
        {bubbleNames(m, element.linePointNames).map((n, k) => (
          <text
            key={`n${k}`}
            x={n.x}
            y={n.y}
            textAnchor="middle"
            fontSize={BUBBLE_NAME_FONT_PX}
            fill={labelOn(colorAt(n.s, m.drawn[n.s]!))}
            fontFamily={fontFamily}
            pointerEvents="none"
          >
            {n.text}
          </text>
        ))}
      </g>
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
          labels={bubbleValueLabels(m)}
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={fontPx}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
