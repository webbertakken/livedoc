'use client';

// A Radar chart (docs/specs/009-elements/pie-chart.md "Radar", D291): a spoke per category clockwise from twelve
// o'clock, each series a closed line through its points, the web always faint behind them, from the marks the export
// draws too (radarMarks). A point's readout reads `category · series: value`.
import {
  chartValue,
  chartValueFontPx,
  legendFontPx,
  lineKeyItems,
  lineValueLabels,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  AXIS_TICK_FONT_PX,
  AXIS_TICK_GAP,
  radarMarks,
  type ShapeElement,
} from '@livedoc/document';
import { useChartAnim, chartFrame } from '@/lib/chart';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { ChartValues } from '@/components/primitives/ChartValues';

const WEB = '#e2e8f0';

export function RadarChartView({
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
  const m = radarMarks(area, categories, series, 0, 0, element.chartAxis === true);
  const hovered = hover ? m.points[hover.s]?.[hover.i] : null;
  const hoveredValue = hover ? chartValue(series[hover.s]?.values[hover.i]) : null;
  const group = useChartAnim(element, `${m.centre.x}px ${m.centre.y}px`);
  const fontPx = chartValueFontPx(element.textSize);

  return (
    <ChartSurface
      w={w}
      h={h}
      items={lineKeyItems(series, 'line')}
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
            label={`${categories[hover.i] ?? ''} · ${series[hover.s]?.name ?? ''}`}
            value={hoveredValue}
          />
        ) : null
      }
    >
      {m.rings.map((d, i) => (
        <path key={`r${i}`} d={d} fill="none" stroke={WEB} strokeWidth={1} />
      ))}
      {m.spokes.map((p, i) => (
        <line
          key={`s${i}`}
          x1={m.centre.x}
          y1={m.centre.y}
          x2={p.x}
          y2={p.y}
          stroke={WEB}
          strokeWidth={1}
        />
      ))}
      {m.axis.left.map((t, i) => (
        <text
          key={`t${i}`}
          x={m.centre.x - AXIS_TICK_GAP}
          y={t.y + AXIS_TICK_FONT_PX / 3}
          textAnchor="end"
          fontSize={AXIS_TICK_FONT_PX}
          fill={textColor}
          fontFamily={fontFamily}
        >
          {t.text}
        </text>
      ))}
      <g className={group.className} style={group.style}>
        {series.map((s, si) => {
          const color = colorAt(si, s);
          return (
            <g key={si}>
              {m.lines[si] ? (
                <path
                  d={m.lines[si]}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ) : null}
              {m.points[si]!.map((p, i) =>
                p ? (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={m.dot}
                    fill={color}
                    {...markProps({ s: si, i })}
                  />
                ) : null,
              )}
            </g>
          );
        })}
      </g>
      {m.names.map((n, i) => (
        <text
          key={`n${i}`}
          x={n.x}
          y={n.y}
          textAnchor={n.anchor}
          fontSize={9}
          fill={textColor}
          fontFamily={fontFamily}
        >
          {n.text}
        </text>
      ))}
      {element.chartValues ? (
        <ChartValues
          labels={lineValueLabels(m, series)}
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={fontPx}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
