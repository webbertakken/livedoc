import type { ReactNode } from 'react';
import { SOLID_BRAND_DARK } from './brand-classes';

// The small count pill: how many things are inside or waiting. The
// Explorer page's rows, cards and sidebar and the floating panel's tree
// show the neutral one beside a folder's name; the Collaborate button and
// panel show the brand one for their open count (docs/specs/012-collaboration/assigned-actions.md §5), the
// "something here wants you" tone. A Plan board paints its own from the
// board's palette (`background` + `color`, docs/specs/026-plan/board-widgets.md
// "The header") at the larger `md` size, so every lone number on a board reads
// the same way. `className` is for the caller's spacing and placement only.
export function CountBadge({
  count,
  children,
  className,
  tone = 'neutral',
  background,
  color,
  size = 'sm',
  label,
}: {
  // The figure; `children` instead when it is more than a number ("▲ 3").
  count?: number;
  children?: ReactNode;
  className?: string;
  tone?: 'neutral' | 'brand';
  // Both set, they replace the tone's colours.
  background?: string;
  color?: string;
  size?: 'sm' | 'md';
  // A spoken name when the figure alone would not say what it counts.
  label?: string;
}) {
  const painted = background !== undefined && color !== undefined;
  const colours = painted
    ? ''
    : tone === 'brand'
      ? `bg-brand-700 text-white ${SOLID_BRAND_DARK}`
      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  // Where an icon would sit (docs/specs/004-interface-design/sizing.md "Shapes"): 16 or 18 px, its figure a glyph.
  const box =
    size === 'md'
      ? 'h-icon-toolbar min-w-icon-toolbar px-1 text-glyph tabular-nums'
      : 'h-icon-row min-w-icon-row px-1 text-glyph';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${box} ${colours}${
        className ? ` ${className}` : ''
      }`}
      style={painted ? { backgroundColor: background, color } : undefined}
      aria-label={label}
    >
      <span className="text-optical-centre">{children ?? count}</span>
    </span>
  );
}
