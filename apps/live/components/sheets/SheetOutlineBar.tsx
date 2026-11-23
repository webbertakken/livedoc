'use client';

// The outline bar (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline", D162, D163, D165): a band left
// of the row numbers and one above the column letters, each group a bracket along its lines ending in its control,
// − when expanded and + when collapsed. The brackets are a picture to a screen reader; each control is a button named
// for what it does. A right-click on a band opens its menu (sheet-pointer-menu.ts).
import { Tooltip } from '@livedoc/ui';
import type { LineGroup, OutlineAxis } from '@livedoc/sheets';
import { lineSpan } from '@/lib/spreadsheet/line-span';
import { useSheetController } from './sheet-controller';
import { OUTLINE_DEPTH_PX } from './sheet-geometry';
import { outlineMarks, type OutlineMark } from './sheet-outline-bar';

const CONTROL_PX = 11;
const TICK_PX = 5;

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type Props = {
  // Collapse or expand a group; null while the grid takes no input.
  onFold: ((axis: OutlineAxis, group: LineGroup, collapsed: boolean) => void) | null;
};

export function SheetOutlineBar({ onFold }: Props) {
  const c = useSheetController();
  const g = c.geometry;
  if (!g.bandW && !g.bandH) return null;
  const line = c.palette.muted;
  // The middle of a group's lane.
  const lane = (m: OutlineMark) => m.lane + OUTLINE_DEPTH_PX / 2;

  const control = (axis: OutlineAxis, m: OutlineMark) => {
    const { group } = m;
    const across = lane(m) - CONTROL_PX / 2;
    const along = m.control! - CONTROL_PX / 2;
    const style = {
      left: axis === 'r' ? across : along,
      top: axis === 'r' ? along : across,
      width: CONTROL_PX,
      height: CONTROL_PX,
      backgroundColor: c.palette.surface,
      color: c.palette.text,
      border: `1px solid ${line}`,
    };
    const glyph = group.collapsed ? '+' : '−';
    const className =
      'absolute flex items-center justify-center rounded-[2px] text-[10px] font-semibold leading-none';
    const key = `${axis}${group.depth}:${group.from}`;
    if (!onFold)
      return (
        <span key={key} className={className} style={style}>
          {glyph}
        </span>
      );
    const label = `${group.collapsed ? 'Expand' : 'Collapse'} ${lineSpan(axis, group.from, group.to)}`;
    return (
      <Tooltip key={key} label={label}>
        <button
          type="button"
          aria-label={label}
          aria-expanded={!group.collapsed}
          className={`${className} pointer-events-auto cursor-pointer`}
          style={style}
          onPointerDown={stop}
          onClick={() => onFold(axis, group, !group.collapsed)}
        >
          <span aria-hidden>{glyph}</span>
        </button>
      </Tooltip>
    );
  };

  const bracket = (axis: OutlineAxis, m: OutlineMark) => {
    const b = m.bracket!;
    const x = lane(m);
    const tick = b.tickAt === 'to' ? b.to - 1 : b.from;
    const key = `${axis}${m.group.depth}:${m.group.from}`;
    const run =
      axis === 'r'
        ? { left: x, top: b.from, width: 1, height: b.to - b.from }
        : { left: b.from, top: x, width: b.to - b.from, height: 1 };
    const end =
      axis === 'r'
        ? { left: x, top: tick, width: TICK_PX, height: 1 }
        : { left: tick, top: x, width: 1, height: TICK_PX };
    return [
      <div key={`${key}b`} className="absolute" style={{ ...run, backgroundColor: line }} />,
      <div key={`${key}t`} className="absolute" style={{ ...end, backgroundColor: line }} />,
    ];
  };

  const band = (axis: OutlineAxis) => {
    const length = axis === 'r' ? c.view.height - g.headH : c.view.width - g.headW;
    const marks = outlineMarks(g, c.viewLayout, axis, c.scroll, length);
    return (
      <>
        <div aria-hidden className="absolute inset-0">
          {marks.flatMap((m) => (m.bracket ? bracket(axis, m) : []))}
        </div>
        {marks.flatMap((m) => (m.control === null ? [] : [control(axis, m)]))}
      </>
    );
  };

  const surface = { backgroundColor: c.palette.column, borderColor: c.palette.cardBorder };
  return (
    <>
      {g.bandW ? (
        <div
          data-outline-band="r"
          className="pointer-events-none absolute left-0 z-[6] overflow-hidden border-r"
          style={{ top: g.headH, width: g.bandW, bottom: 0, ...surface }}
        >
          {band('r')}
        </div>
      ) : null}
      {g.bandH ? (
        <div
          data-outline-band="c"
          className="pointer-events-none absolute top-0 z-[6] overflow-hidden border-b"
          style={{ left: g.headW, height: g.bandH, right: 0, ...surface }}
        >
          {band('c')}
        </div>
      ) : null}
    </>
  );
}
