'use client';

// A Table chart (docs/specs/009-elements/pie-chart.md "Table", D374): the chart's data written as a table, a bold
// header over its line, a row per category, a faint band on every second row, the rows that do not fit counted in the
// last. No legend and no readout: the table writes its numbers. Laid out by the marks the export draws too
// (`tableMarks`).

import {
  chartValueFontPx,
  legendFontPx,
  tableMarks,
  TABLE_BAND,
  type ShapeElement,
  type TableCell,
} from '@livedoc/document';
import { ChartSurface } from '@/components/primitives/ChartSurface';
import { chartFrame } from '@/lib/chart';

export function TableChartView({
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
    { ...element, chartLegend: false, chartAxisTitles: undefined },
    palette,
    ground,
  );
  const px = chartValueFontPx(element.textSize);
  const m = tableMarks(
    area,
    element.lineCategories ?? [],
    element.lineSeries ?? [],
    element.chartAxisTitles?.x ?? '',
    0,
    0,
    px,
  );
  const text = (c: TableCell, key: string, bold?: boolean) => (
    <text
      key={key}
      x={c.x}
      y={c.y}
      textAnchor={c.anchor}
      fontFamily={fontFamily}
      fontSize={px}
      fontWeight={bold ? 600 : undefined}
      fill={textColor}
    >
      {c.text}
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
      {m.bands.map((b, i) => (
        <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={TABLE_BAND} />
      ))}
      <line
        x1={m.rule.x1}
        y1={m.rule.y}
        x2={m.rule.x2}
        y2={m.rule.y}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {m.header.map((c, j) => text(c, `h${j}`, true))}
      {m.rows.flatMap((r, i) => r.map((c, j) => text(c, `${i}-${j}`)))}
    </ChartSurface>
  );
}
