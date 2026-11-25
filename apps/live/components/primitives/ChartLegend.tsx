// The legend shared by the chart-family element views (pie, bar, line): a
// colour-swatch + label per datum, painted into the strip the chart layout
// reserves (`legend` from chartFrame — docs/specs/009-elements/pie-chart.md). A left/right legend stacks in
// a column; a top/bottom legend wraps in a centred row. Renders nothing when
// the strip is too small to read, so callers can always mount it. `colorAt`
// resolves each datum's swatch colour (explicit slice colour, else the
// palette), matching how the chart body colours its slices / bars.

import type { ChartKeyItem, ChartLegendPosition } from '@livedoc/document';

type LegendRect = {
  show: boolean;
  pos: ChartLegendPosition;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function ChartLegend({
  items,
  colorAt,
  legend,
  textColor,
  fontFamily,
  fontPx,
}: {
  items: readonly ChartKeyItem[];
  colorAt: (index: number, item: ChartKeyItem) => string;
  legend: LegendRect;
  textColor: string;
  fontFamily?: string;
  // The row text size, from the chart's Text Size (legendFontPx, docs/specs/009-elements/pie-chart.md).
  fontPx: number;
}) {
  // The swatch keeps its proportion to the words beside it.
  const swatch = Math.round(fontPx * 0.8);
  const vertical = legend.pos === 'left' || legend.pos === 'right';
  if (!legend.show || (vertical ? legend.w < 48 : legend.h < 18)) return null;
  return (
    <div
      className={`pointer-events-none absolute flex overflow-hidden ${
        vertical
          ? 'flex-col justify-center gap-0.5'
          : 'flex-row flex-wrap content-center justify-center gap-x-2 gap-y-0.5'
      }`}
      style={{
        left: legend.x,
        top: legend.y,
        width: legend.w,
        height: legend.h,
        padding: 2,
        color: textColor,
        fontFamily,
      }}
      aria-hidden
    >
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1 leading-tight">
          {item.line ? (
            // A scatter series drawn as a line (pie-chart.md "A scatter series drawn as a line"): a line through a dot.
            <svg
              data-key-swatch="line"
              className="shrink-0"
              width={swatch}
              height={swatch}
              viewBox="0 0 12 12"
            >
              <line x1="0" y1="6" x2="12" y2="6" stroke={colorAt(i, item)} strokeWidth="2" />
              <circle cx="6" cy="6" r="3" fill={colorAt(i, item)} />
            </svg>
          ) : (
            <span
              data-key-swatch="square"
              className="inline-block shrink-0 rounded-none"
              style={{ width: swatch, height: swatch, backgroundColor: colorAt(i, item) }}
            />
          )}
          <span className="truncate" style={{ fontSize: fontPx }}>
            {item.label || '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
