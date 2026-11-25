import type { LineSeries } from '@livedoc/document';
import { TileLabel } from '@/components/palette/context-menu-tiles';
import { SizeButton } from '@/components/palette/palette-controls';
import { SeriesDot, SeriesLineGlyph, seriesTileName } from './chart-series-tile';

// Lines (docs/specs/009-elements/pie-chart.md "A scatter series drawn as a line"), in a scatter chart's Chart
// category: a tile per series, pressed while its points are joined as a line; a press flips that one series.
export function ChartLinesRows({
  series,
  palette,
  onSetLine,
}: {
  series: readonly LineSeries[];
  // The fallback ramp, so a series' glyph matches its marks.
  palette: readonly string[];
  onSetLine: (index: number, on: boolean) => void;
}) {
  return (
    <>
      <p className="px-3 pt-1 text-supporting text-slate-500 dark:text-slate-400">Lines</p>
      <div className="grid grid-cols-3 gap-1 px-2 py-1.5">
        {series.map((s, i) => {
          const line = s.line === true;
          const color = s.color ?? palette[i % palette.length]!;
          const name = s.name || `Series ${i + 1}`;
          return (
            <SizeButton key={i} active={line} label={name} onClick={() => onSetLine(i, !line)}>
              <TileLabel
                glyph={line ? <SeriesLineGlyph color={color} /> : <SeriesDot color={color} />}
                label={seriesTileName(name)}
              />
            </SizeButton>
          );
        })}
      </div>
    </>
  );
}
