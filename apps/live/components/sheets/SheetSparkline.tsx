// A SPARKLINE's chart in its cell (docs/specs/029-sheets/charts.md "Sparklines"): the engine's shapes, drawn as an
// SVG over the cell's box, the paint tokens in the sheet's accent and muted ink.
import { sparklineShapes, SPARK_ACCENT, SPARK_MUTED, type Sparkline } from '@livedoc/sheets';

type Props = {
  chart: Sparkline;
  box: { x: number; y: number; w: number; h: number };
  // The cell's own text colour, a line's default before the accent.
  ink: string | undefined;
  accent: string;
  muted: string;
  // Faded like a value waiting for its new one (formulas.md "Recalculation").
  waitingOpacity?: number;
};

const KIND_LABELS = { line: 'Line', column: 'Column', winloss: 'Win/loss', bar: 'Bar' } as const;

export function SheetSparkline({ chart, box, ink, accent, muted, waitingOpacity }: Props) {
  const shapes = sparklineShapes(chart, box.w, box.h, ink);
  const paint = (token: string) =>
    token === SPARK_ACCENT ? accent : token === SPARK_MUTED ? muted : token;
  return (
    <svg
      data-sheet-sparkline={chart.kind}
      role="img"
      aria-label={`${KIND_LABELS[chart.kind]} sparkline of ${chart.values.length} values`}
      className="pointer-events-none absolute"
      width={box.w}
      height={box.h}
      style={{
        left: box.x,
        top: box.y,
        zIndex: 1,
        ...(waitingOpacity === undefined
          ? {}
          : { opacity: waitingOpacity, transition: 'opacity 0s 120ms' }),
      }}
    >
      {shapes.map((s, i) =>
        s.k === 'path' ? (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={paint(s.paint)}
            strokeWidth={s.width}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          <rect
            key={i}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            fill={paint(s.paint)}
            fillOpacity={s.opacity}
          />
        ),
      )}
    </svg>
  );
}
