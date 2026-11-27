'use client';

// A section's Add button in the Pivot Table Editor (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): a
// menu of the source's columns by name; the arrow keys move, Enter picks, Escape closes and gives focus back.
import { useRef } from 'react';
import { useClickOutside, useMenu, useMenuButton } from '@livedoc/ui';
import type { PivotColumn } from '@livedoc/sheets';

export function PivotAddMenu({
  section,
  columns,
  onPick,
}: {
  // The section's name, for the button's label (`Add Rows`).
  section: string;
  columns: readonly PivotColumn[];
  onPick: (column: PivotColumn) => void;
}) {
  const { open, close, toggle, trigger, setTrigger, onTriggerKeyDown } = useMenuButton();
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, close, open);
  return (
    <div ref={box} className="relative">
      <button
        ref={setTrigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Add ${section}`}
        disabled={columns.length === 0}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className="min-h-row cursor-pointer rounded-control border border-(--office-line) px-3 text-body text-(--office-ink) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
      >
        Add
      </button>
      {open ? (
        <AddList
          trigger={trigger}
          section={section}
          columns={columns}
          onClose={close}
          onPick={(column) => {
            close();
            onPick(column);
          }}
        />
      ) : null}
    </div>
  );
}

function AddList({
  trigger,
  section,
  columns,
  onClose,
  onPick,
}: {
  trigger: HTMLElement | null;
  section: string;
  columns: readonly PivotColumn[];
  onClose: () => void;
  onPick: (column: PivotColumn) => void;
}) {
  const { attach, surfaceProps } = useMenu({ onClose, trigger, label: `Add ${section}` });
  return (
    <div
      ref={attach}
      {...surfaceProps}
      className="absolute top-full right-0 z-30 mt-1 max-h-72 w-56 overflow-auto rounded-menu bg-(--office-menu) py-1 text-(--office-ink) shadow-lg outline-none"
    >
      {columns.map((column) => (
        <button
          key={column.col}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onPick(column)}
          className="block min-h-row w-full truncate px-4 py-1 text-left text-body outline-none hover:bg-(--office-menu-hover) focus-visible:bg-(--office-menu-hover)"
        >
          {column.name}
        </button>
      ))}
    </div>
  );
}
