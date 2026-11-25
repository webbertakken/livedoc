// A line chart's series as a tile in the Chart category (docs/specs/009-elements/pie-chart.md "A second axis",
// "A scatter series drawn as a line"): its name, cut to the tile, beside a glyph in its colour.

// A series' colour as a square, as its key shows it.
export function SeriesDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-icon-chevron rounded-none border border-slate-300 dark:border-slate-600"
      style={{ backgroundColor: color }}
    />
  );
}

// A series drawn as a line: a short line through a dot, in its colour, as its key shows it.
export function SeriesLineGlyph({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-icon-chevron shrink-0">
      <line x1="0" y1="6" x2="12" y2="6" stroke={color} strokeWidth="2" />
      <circle cx="6" cy="6" r="2.5" fill={color} />
    </svg>
  );
}

// A tile holds about ten characters at its caption size.
export const seriesTileName = (name: string) => (name.length > 10 ? `${name.slice(0, 9)}…` : name);
