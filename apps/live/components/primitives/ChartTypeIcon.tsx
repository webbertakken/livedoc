// One glyph per chart type (docs/specs/009-elements/pie-chart.md "Chart types"), drawn on the 24-unit grid with the
// house stroke in `currentColor`: the Sheet toolbar's Insert Chart menu, the cell menu, a chart's Chart Type tiles and
// a Dashboard's chart picker all show a type by the same picture.
import { Glyph, Prims } from '@livedoc/ui';
import { lucideChartPie } from '@livedoc/icons/lucide';
import type { ChartType } from '@livedoc/document';

const AXES = 'M3 3v18h18';

const MARKS: Record<ChartType, React.ReactNode> = {
  column: (
    <>
      <path d={AXES} />
      <path d="M8 17v-5M13 17V8M18 17v-8" />
    </>
  ),
  bar: (
    <>
      <path d={AXES} />
      <path d="M7 7h6M7 12h11M7 17h8" />
    </>
  ),
  line: (
    <>
      <path d={AXES} />
      <path d="m7 15 4-5 3 3 5-6" />
    </>
  ),
  area: (
    <>
      <path d={AXES} />
      <path d="M7 17v-3l4-5 3 3 5-5v10Z" fill="currentColor" fillOpacity={0.25} />
    </>
  ),
  'stepped-area': (
    <>
      <path d={AXES} />
      <path d="M7 17v-4h4V9h4v3h4v5Z" fill="currentColor" fillOpacity={0.25} />
    </>
  ),
  scatter: (
    <>
      <path d={AXES} />
      <circle cx="8" cy="15" r="1.2" fill="currentColor" />
      <circle cx="11" cy="10" r="1.2" fill="currentColor" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" />
      <circle cx="18" cy="7" r="1.2" fill="currentColor" />
    </>
  ),
  bubble: (
    <>
      <path d={AXES} />
      <circle cx="9" cy="14" r="2.5" fill="currentColor" fillOpacity={0.25} />
      <circle cx="16" cy="9" r="3.5" fill="currentColor" fillOpacity={0.25} />
      <circle cx="15" cy="16" r="1.3" fill="currentColor" fillOpacity={0.25} />
    </>
  ),
  pie: <Prims prims={lucideChartPie} />,
  doughnut: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v5M21 12h-5" />
    </>
  ),
  radar: (
    <>
      <path d="M12 3l8.5 6.2-3.3 10H6.8L3.5 9.2Z" />
      <path d="M12 8l4 3.2-1.6 4.6H9.6L8 11.2Z" fill="currentColor" fillOpacity={0.25} />
    </>
  ),
  candlestick: (
    <>
      <path d="M8 4v16M16 6v13" />
      <rect x="6" y="8" width="4" height="7" fill="currentColor" />
      <rect x="14" y="9" width="4" height="6" />
    </>
  ),
  ohlc: (
    <>
      <path d="M8 4v16M5.5 13H8M8 7h2.5" />
      <path d="M16 6v13M13.5 9H16M16 16h2.5" />
    </>
  ),
  histogram: (
    <>
      <path d={AXES} />
      <path d="M7 17v-5h3v5M10 17V7h3v10M13 17v-7h3v7M16 17v-3h3v3" />
    </>
  ),
  combo: (
    <>
      <path d={AXES} />
      <path d="M8 17v-4M13 17v-6M18 17v-3" />
      <path d="m7 9 5-3 6 2" />
    </>
  ),
};

export function ChartTypeIcon({ type, size = 16 }: { type: ChartType; size?: number }) {
  return (
    <Glyph size={size} units={24}>
      {MARKS[type]}
    </Glyph>
  );
}
