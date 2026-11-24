'use client';

// A menu's size grid (docs/specs/004-interface-design/office-shell.md "Menus as data"): Insert > Table's cells, one
// menu item. Hovering a cell sizes it and a press inserts that size; with the keyboard it starts at 1 x 1, the arrows
// size it, Enter or Space inserts, and an arrow that cannot change the size is the menu's own. The cells are drawn for
// the eye only: the item's name says the size.
import { useState, type KeyboardEvent } from 'react';
import type { OfficeAction, OfficeItem } from '@/lib/office/office-catalogue';
import {
  gridSizeLabel,
  gridSizeName,
  shownGrid,
  stepGrid,
  type GridSize,
} from '@/lib/office/size-grid';

const CELL_PX = 18;
const CELL_GAP_PX = 2;

export function OfficeSizeGrid({
  item,
  most,
  action,
  onDone,
}: {
  item: OfficeItem;
  most: GridSize;
  action: OfficeAction | undefined;
  onDone: () => void;
}) {
  const [size, setSize] = useState<GridSize>({ columns: 1, rows: 1 });
  const inert = item.status === 'comingSoon' || !action?.runSized || action.disabled === true;
  const shown = shownGrid(size, most);
  const insert = () => {
    if (inert) return;
    onDone();
    action.runSized?.(size);
  };
  // Ahead of the menu's own keys: an arrow that changes the size is the grid's.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const next = stepGrid(size, e.key, most);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setSize(next);
  };
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={inert || undefined}
      aria-label={gridSizeName(item.label, size)}
      data-office-item={item.id}
      onKeyDownCapture={onKeyDownCapture}
      onClick={insert}
      className={`flex w-full flex-col items-start gap-2 px-4 py-2 outline-none focus-visible:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--office-focus) ${
        inert ? 'cursor-default opacity-50' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${shown.columns}, ${CELL_PX}px)`,
          gap: CELL_GAP_PX,
        }}
      >
        {Array.from({ length: shown.rows }, (_, r) =>
          Array.from({ length: shown.columns }, (_, c) => {
            const filled = c < size.columns && r < size.rows;
            return (
              <span
                key={`${c + 1}x${r + 1}`}
                data-size-cell={`${c + 1}x${r + 1}`}
                data-filled={filled || undefined}
                onPointerEnter={() => setSize({ columns: c + 1, rows: r + 1 })}
                style={{ width: CELL_PX, height: CELL_PX }}
                className={`rounded-[2px] border ${
                  filled
                    ? 'border-(--office-focus) bg-(--office-pressed)'
                    : 'border-(--office-line) bg-(--office-menu)'
                }`}
              />
            );
          }),
        )}
      </span>
      <span aria-hidden="true" className="text-supporting text-(--office-muted)">
        {gridSizeLabel(size)}
      </span>
    </button>
  );
}
