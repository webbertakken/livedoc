'use client';

// Candlestick and OHLC charts (docs/specs/009-elements/pie-chart.md "Candlestick and OHLC", D322): each category's wick
// and body (or line and ticks) in the first series' colour, a falling body filled and a rising one hollow, on a line
// chart's axes, from the marks the export draws too (stockMarks). A mark's readout reads its prices; no legend keys the
// series, which are one price.
import {
  chartTypeOf,
  chartValueFontPx,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  stockBody,
  stockMarks,
  stockPath,
  stockReadout,
  stockValueLabels,
  type ShapeElement,
} from '@livedoc/document';
import { useChartAnim, chartFrame } from '@/lib/chart';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { ChartValues } from '@/components/primitives/ChartValues';
import { LineChartAxis } from './ChartAxis';

export function StockChartView({
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
  const { w, h, colorAt, area, legend, titles } = chartFrame(
    { ...element, chartLegend: false },
    palette,
    ground,
  );
  const { hover, markProps } = useChartHover<number>((a, b) => a === b);
  const categories =
    element.lineCategories && element.lineCategories.length > 0
      ? element.lineCategories
      : LINE_DEFAULT_CATEGORIES;
  const series =
    element.lineSeries && element.lineSeries.length > 0 ? element.lineSeries : LINE_DEFAULT_SERIES;
  const m = stockMarks(area, categories, series, 0, 0, element.chartAxis === true);
  const candle = chartTypeOf(element) === 'candlestick';
  const color = colorAt(0, series[0]!);
  const hovered = hover === null ? null : m.marks[hover];
  const { x: plotX0, y: plotY0, w: plotW, h: plotH } = m.plot;
  const group = useChartAnim(element, `${plotX0 + plotW / 2}px ${plotY0 + plotH / 2}px`);
  const fontPx = chartValueFontPx(element.textSize);

  return (
    <ChartSurface
      w={w}
      h={h}
      items={[]}
      colorAt={colorAt}
      legend={legend}
      titles={titles}
      textColor={textColor}
      fontFamily={fontFamily}
      fontPx={fontPx}
      readout={
        hover !== null && hovered ? (
          <ChartReadout
            leftPct={(hovered.x / w) * 100}
            topPct={(hovered.top / h) * 100}
            text={stockReadout(categories, series, hover)}
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
        {m.marks.map((mark, i) => {
          if (!mark) return null;
          const body = candle ? stockBody(mark) : null;
          return (
            <g key={i} {...markProps(i)}>
              {/* A clear hit area over the whole mark, so a thin line is easy to hover. */}
              <rect
                x={mark.x - mark.half}
                y={mark.top}
                width={mark.half * 2}
                height={Math.max(1, mark.bottom - mark.top)}
                fill="transparent"
              />
              <path d={stockPath(mark, candle)} fill="none" stroke={color} strokeWidth={1.5} />
              {body ? (
                <rect
                  x={body.x}
                  y={body.y}
                  width={body.w}
                  height={body.h}
                  fill={mark.rising ? 'none' : color}
                  stroke={color}
                  strokeWidth={1.5}
                />
              ) : null}
            </g>
          );
        })}
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
          labels={stockValueLabels(m, series)}
          textColor={textColor}
          fillOf={() => textColor}
          fontPx={fontPx}
          fontFamily={fontFamily}
        />
      ) : null}
    </ChartSurface>
  );
}
