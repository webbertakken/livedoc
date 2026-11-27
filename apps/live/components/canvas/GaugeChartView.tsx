'use client';

// A Gauge chart (docs/specs/009-elements/pie-chart.md "Gauge", D330): each slice a dial on one shared scale, its value's
// stretch in the slice's colour, a needle, the value and its label; no legend, each dial naming itself. Laid out by the
// marks the export draws too (`gaugeMarks`).

import {
  AXIS_TICK_FONT_PX,
  chartValue,
  chartValueFontPx,
  gaugeArcWidth,
  gaugeMarks,
  GAUGE_NEEDLE,
  GAUGE_TRACK,
  legendFontPx,
  type ShapeElement,
} from '@livedoc/document';
import { ChartReadout } from '@/components/primitives/ChartReadout';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { useChartHover } from '@/hooks/canvas/useChartHover';
import { chartFrame } from '@/lib/chart';

export function GaugeChartView({
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
  const { w, h, data, colorAt, area, legend, titles } = chartFrame(
    { ...element, chartLegend: false },
    palette,
    ground,
  );
  const { hover, markProps } = useChartHover<number>();
  const m = gaugeMarks(area, data);
  const px = chartValueFontPx(element.textSize);
  const hovered = hover === null ? null : m.dials[hover];
  const hoveredValue = hover === null ? null : chartValue(data[hover]?.value);

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
      fontPx={legendFontPx(element.textSize)}
      readout={
        hover !== null && hovered && hoveredValue !== null ? (
          <ChartReadout
            leftPct={(hovered.cx / w) * 100}
            topPct={((hovered.cy - hovered.r) / h) * 100}
            label={data[hover]!.label}
            value={hoveredValue}
          />
        ) : null
      }
    >
      {m.dials.map((d, i) => (
        <g key={i} {...markProps(i)}>
          <circle cx={d.cx} cy={d.cy} r={d.r} fill="transparent" />
          <path d={d.track} fill="none" stroke={GAUGE_TRACK} strokeWidth={gaugeArcWidth(d)} />
          {d.fill ? (
            <path
              d={d.fill}
              fill="none"
              stroke={colorAt(i, data[i]!)}
              strokeWidth={gaugeArcWidth(d)}
            />
          ) : null}
          {d.needle ? (
            <>
              <line
                x1={d.cx}
                y1={d.cy}
                x2={d.needle.x}
                y2={d.needle.y}
                stroke={GAUGE_NEEDLE}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx={d.cx} cy={d.cy} r={3} fill={GAUGE_NEEDLE} />
            </>
          ) : null}
          {d.value ? (
            <text
              x={d.cx}
              y={d.cy + d.r * 0.42}
              textAnchor="middle"
              fontFamily={fontFamily}
              fontSize={px + 2}
              fontWeight={600}
              fill={textColor}
            >
              {d.value}
            </text>
          ) : null}
          <text
            x={d.label.x}
            y={d.label.y}
            textAnchor="middle"
            fontFamily={fontFamily}
            fontSize={px}
            fill={textColor}
          >
            {d.label.text}
          </text>
        </g>
      ))}
      {m.ends.map((e, i) => (
        <text
          key={i}
          x={e.x}
          y={e.y}
          textAnchor={e.anchor}
          fontFamily={fontFamily}
          fontSize={AXIS_TICK_FONT_PX}
          fill={textColor}
          aria-hidden="true"
        >
          {e.text}
        </text>
      ))}
    </ChartSurface>
  );
}
