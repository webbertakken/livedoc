'use client';

// Hover readout for a chart mark (pie slice / bar / point), shared by the chart-family
// views (docs/specs/009-elements/pie-chart.md). Shows the hovered datum's label + value, or lines one under the other,
// the first naming it (a scatter point's: its name, then `label: number` a line). Positioned by percentage within the chart body (the `absolute inset-0` wrapper),
// anchored above its point (translate -50% / -100%), and kept in view: it moves in along its side when what is seen
// of the page cuts it, and sits below its point with no room above ("The readout stays in view"). pointer-events-none
// so it never eats the hover that drives it or the element's drag. Independent of the legend toggle — it's the only
// way to read values when the legend is off.

import { useLayoutEffect, useRef, useState } from 'react';
import { READOUT_BELOW_GAP_PX, readoutPlace, visibleArea } from '@/lib/chart-readout-place';

type Place = { dx: number; below: boolean };
const AT_REST: Place = { dx: 0, below: false };

export function ChartReadout(
  props: {
    leftPct: number;
    topPct: number;
    // Which edge sits at the point: centred by default; 'start' or 'end' near a side, so it grows inward and never
    // runs out of a small box (a Sankey's preview in its Flows dialog).
    align?: 'start' | 'center' | 'end';
  } & (
    | {
        label: string;
        // A number for a chart's datum; a ready-made phrase for a Sankey band or node (docs/specs/009-elements/sankey.md).
        value: number | string;
      }
    // A ready-made line (a grouped bar's), or lines one under the other, the first naming the point.
    | { text: string }
    | { lines: readonly string[] }
  ),
) {
  const { leftPct, topPct, align = 'center' } = props;
  const lines = 'lines' in props ? props.lines : null;
  const text =
    'lines' in props
      ? props.lines.join('\n')
      : 'text' in props
        ? props.text
        : `${props.label || '—'}: ${props.value}`;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place>(AT_REST);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => {
      const frame = el.offsetParent;
      if (!(frame instanceof HTMLElement) || frame.offsetWidth === 0) return;
      const r = frame.getBoundingClientRect();
      // The chart may be drawn scaled (a zoomed canvas): its px on screen per px of its own.
      const scale = r.width / frame.offsetWidth;
      const next = readoutPlace(
        {
          x: r.left + (leftPct / 100) * r.width,
          y: r.top + (topPct / 100) * r.height,
          width: el.offsetWidth * scale,
          height: el.offsetHeight * scale,
          gap: READOUT_BELOW_GAP_PX * scale,
          align,
        },
        visibleArea(el),
      );
      const dx = next.dx / scale;
      setPlace((was) =>
        was.dx === dx && was.below === next.below ? was : { dx, below: next.below },
      );
    };
    measure();
    // The page scrolling under a held hover (a sheet's cells) moves what is seen.
    window.addEventListener('scroll', measure, true);
    return () => window.removeEventListener('scroll', measure, true);
  }, [leftPct, topPct, align, text]);
  const shift =
    align === 'start'
      ? 'translate-x-0'
      : align === 'end'
        ? '-translate-x-full'
        : '-translate-x-1/2';
  return (
    <div
      ref={ref}
      aria-hidden
      data-chart-readout={place.below ? 'below' : 'above'}
      className={`pointer-events-none absolute z-[var(--z-panel)] ${shift} ${place.below ? 'translate-y-0' : '-translate-y-full'} whitespace-nowrap rounded-control bg-slate-900/95 px-2 py-0.5 text-supporting text-white shadow-lg dark:bg-slate-700`}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        ...(place.dx ? { marginLeft: place.dx } : {}),
        ...(place.below ? { marginTop: READOUT_BELOW_GAP_PX } : {}),
      }}
    >
      {lines ? lines.map((line, at) => <div key={at}>{line}</div>) : text}
    </div>
  );
}
