import type { LineSeries } from '@livedoc/document';
import { MenuToggleRow } from '@/components/palette/context-menu-input-rows';
import { TileLabel } from '@/components/palette/context-menu-tiles';
import { SizeButton } from '@/components/palette/palette-controls';
import { SeriesDot, seriesTileName } from './chart-series-tile';

// Show Axis and Right Axis (docs/specs/009-elements/pie-chart.md "Show Axis", "A second axis"), under Show Values in
// the Chart category: the value axis on a column, bar, line, area or scatter chart, and on a line chart of two or
// more series the one series drawn against a scale of its own.
export function ChartAxisRows({
  axis,
  series,
  palette,
  onSetAxis,
  onSetRightAxis,
}: {
  axis: boolean;
  // A line chart's series (null for a column or bar chart, which has one scale).
  series: readonly LineSeries[] | null;
  // The fallback ramp, so a series' dot matches its line.
  palette: readonly string[];
  onSetAxis: (value: boolean) => void;
  onSetRightAxis: (index: number | null) => void;
}) {
  const right = series ? series.findIndex((s) => s.axis === 'right') : -1;
  return (
    <>
      <MenuToggleRow
        label="Show Axis"
        description="Tick values and gridlines"
        checked={axis}
        onToggle={() => onSetAxis(!axis)}
      />
      {series && series.length > 1 ? (
        <>
          <p className="px-3 pt-1 text-supporting text-slate-500 dark:text-slate-400">Right Axis</p>
          <div className="grid grid-cols-3 gap-1 px-2 py-1.5">
            <SizeButton active={right < 0} onClick={() => onSetRightAxis(null)}>
              <TileLabel glyph={<SeriesDot color="transparent" />} label="None" />
            </SizeButton>
            {series.map((s, i) => (
              <SizeButton
                key={i}
                active={right === i}
                label={s.name || `Series ${i + 1}`}
                onClick={() => onSetRightAxis(i)}
              >
                <TileLabel
                  glyph={<SeriesDot color={s.color ?? palette[i % palette.length]!} />}
                  label={seriesTileName(s.name || `Series ${i + 1}`)}
                />
              </SizeButton>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
