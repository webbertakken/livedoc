'use client';

// An office toolbar's choice grid (docs/specs/004-interface-design/office-shell.md "Toolbar", split toggle): the kind's
// choices drawn as small previews, a WAI-ARIA menu of `menuitemradio` cells, the one in force checked. The shared menu
// keyboard (useMenu) opens it on the checked cell, closes it on Escape, Tab or a press outside; the grid adds moving by
// cell (Left, Right) and by row (Up, Down). A choice runs the kind's action, which gives focus back to the writing.
import type { KeyboardEvent } from 'react';
import { useMenu } from '@livedoc/ui';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { GRID_KEYS, gridStep, type GridKey } from '@/lib/office/grid-step';

/** One line of a cell's preview: a marker at a level, then a bar standing for text, or a word. */
export type OfficeGridLine = {
  level: number;
  marker: string;
  // A checklist's box in the marker's place, ticked or not.
  box?: 'open' | 'ticked';
  // A word in the bar's place, struck through or not (a checklist with or without strikethrough).
  word?: { text: string; struck: boolean };
};

export type OfficeGridCell = { id: string; label: string; lines: readonly OfficeGridLine[] };

/** What a split toggle's chevron opens: cells, `columns` to a row, each run by the choice's action of its id. */
export type OfficeGrid = { columns: number; cells: readonly OfficeGridCell[] };

const LEVEL_STEP_PX = 9;

function Preview({ lines }: { lines: readonly OfficeGridLine[] }) {
  return (
    <span aria-hidden="true" className="flex w-full flex-col gap-1.5">
      {lines.map((line, i) => (
        <span
          key={i}
          className="flex items-center gap-1 text-[11px] leading-none"
          style={{ paddingLeft: line.level * LEVEL_STEP_PX }}
        >
          {line.box ? (
            <span
              data-box={line.box}
              className="flex size-2.5 shrink-0 items-center justify-center rounded-[2px] border border-(--office-icon) text-[8px] leading-none"
            >
              {line.box === 'ticked' ? '✓' : ''}
            </span>
          ) : (
            <span className="min-w-3 shrink-0 text-(--office-ink)">{line.marker}</span>
          )}
          {line.word ? (
            <span className={`text-(--office-muted) ${line.word.struck ? 'line-through' : ''}`}>
              {line.word.text}
            </span>
          ) : (
            <span className="h-0.5 flex-1 rounded-full bg-(--office-line)" />
          )}
        </span>
      ))}
    </span>
  );
}

export function OfficeChoiceGrid({
  label,
  grid,
  actions,
  value,
  trigger,
  onClose,
}: {
  label: string;
  grid: OfficeGrid;
  actions: OfficeActions;
  // The cell in force; null for none.
  value: string | null;
  trigger: HTMLElement | null;
  onClose: () => void;
}) {
  const { attach, surfaceProps } = useMenu({ onClose, trigger, label });
  // Up and Down by a row, Left and Right by a cell, ahead of the menu's own Up and Down.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!GRID_KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cells = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const at = cells.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    // Handled here: neither the menu's keys nor the toolbar's (an ancestor in React's tree, through the portal) see it.
    e.preventDefault();
    e.stopPropagation();
    cells[gridStep(at, cells.length, grid.columns, e.key as GridKey)]?.focus({
      preventScroll: true,
    });
  };
  return (
    <div
      ref={attach}
      {...surfaceProps}
      onKeyDownCapture={onKeyDownCapture}
      style={{ gridTemplateColumns: `repeat(${grid.columns}, 4.5rem)` }}
      className="grid gap-1.5 rounded-md border border-(--office-line) bg-(--office-menu) p-2 shadow-lg animate-fade-in motion-reduce:animate-none"
    >
      {grid.cells.map((cell) => {
        const checked = cell.id === value;
        return (
          <button
            key={cell.id}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            aria-label={cell.label}
            tabIndex={-1}
            data-office-grid-cell={cell.id}
            onClick={() => {
              onClose();
              actions[cell.id]?.run();
            }}
            className={`flex h-14 items-start rounded-md border px-1.5 py-2 outline-none hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--office-focus) ${
              checked ? 'border-(--office-focus) bg-(--office-pressed)' : 'border-(--office-line)'
            }`}
          >
            <Preview lines={cell.lines} />
          </button>
        );
      })}
    </div>
  );
}
