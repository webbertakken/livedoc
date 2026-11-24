'use client';

// A grid of glyphs to press (docs/specs/034-text-documents/objects.md "Special characters", "Emoji"): each cell named
// by its item, the grid one Tab stop whose arrows move by a cell and a row as the grid lays them out, Home and End to
// the first and last. Hovering or focusing a cell shows it; a press picks it. Drawn again only when its items change,
// not as the caller's preview follows the pointer.
import { memo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { GRID_KEYS, gridStep, type GridKey } from '@/lib/office/grid-step';

const KEYS = [...GRID_KEYS, 'Home', 'End'];

type Props<T> = {
  label: string;
  items: readonly T[];
  keyOf: (item: T) => string | number;
  nameOf: (item: T) => string;
  draw: (item: T) => ReactNode;
  onPick: (item: T) => void;
  onShow: (item: T) => void;
  // The cell's glyph size, a Tailwind text class.
  size?: string;
  // A set number of cells to a row (the Borders panel's five); else as many as the width takes.
  columns?: number;
};

function Grid<T>({
  label,
  items,
  keyOf,
  nameOf,
  draw,
  onPick,
  onShow,
  size = 'text-xl',
  columns,
}: Props<T>) {
  // The cell that is the grid's one Tab stop.
  const [active, setActive] = useState(0);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cells = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    // The cells of the first row, as the grid lays them out at its width now.
    const top = cells[0]?.offsetTop;
    const wrapped = cells.findIndex((cell) => cell.offsetTop !== top);
    const columns = wrapped > 0 ? wrapped : cells.length;
    const to =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? cells.length - 1
          : gridStep(at, cells.length, columns, e.key as GridKey);
    setActive(to);
    cells[to]?.focus();
  };
  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={
        columns ? { gridTemplateColumns: `repeat(${columns}, minmax(2.5rem, 1fr))` } : undefined
      }
      className="grid min-h-0 min-w-0 flex-1 auto-rows-[2.5rem] grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] content-start overflow-y-auto rounded border border-(--office-line) p-1"
    >
      {items.map((item, index) => (
        <button
          key={keyOf(item)}
          type="button"
          tabIndex={index === active ? 0 : -1}
          aria-label={nameOf(item)}
          onClick={() => {
            setActive(index);
            onPick(item);
          }}
          onMouseEnter={() => onShow(item)}
          onFocus={() => onShow(item)}
          className={`flex items-center justify-center rounded text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset ${size}`}
        >
          {draw(item)}
        </button>
      ))}
    </div>
  );
}

export const OfficeGlyphGrid = memo(Grid) as typeof Grid;
