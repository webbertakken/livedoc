'use client';

// A Scorecard chart (docs/specs/009-elements/pie-chart.md "Scorecard", D345): the first series' sum written large, its
// name under it, and its change from the second series' sum under that, green over and red under. No legend and no
// readout: the chart writes its numbers. Laid out by the marks the export draws too (`scorecardMarks`).

import {
  chartValueFontPx,
  legendFontPx,
  scorecardChangeInk,
  scorecardMarks,
  type ShapeElement,
} from '@livedoc/document';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { chartFrame } from '@/lib/chart';

export function ScorecardChartView({
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
  const m = scorecardMarks(
    area,
    element.lineSeries ?? [],
    0,
    0,
    chartValueFontPx(element.textSize),
  );
  const line = (
    l: { x: number; y: number; text: string; px: number },
    fill: string,
    bold?: boolean,
  ) => (
    <text
      x={l.x}
      y={l.y}
      textAnchor="middle"
      fontFamily={fontFamily}
      fontSize={l.px}
      fontWeight={bold ? 700 : undefined}
      fill={fill}
    >
      {l.text}
    </text>
  );

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
    >
      {m.key ? line(m.key, textColor, true) : null}
      {line(m.name, textColor)}
      {m.change ? line(m.change, scorecardChangeInk(m.change.tone, textColor, ground)) : null}
    </ChartSurface>
  );
}
