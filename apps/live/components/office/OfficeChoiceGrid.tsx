'use client';

// An office toolbar's choice grid (docs/specs/004-interface-design/office-shell.md "Toolbar", split toggle): the kind's
// choices drawn as small previews, a WAI-ARIA menu of `menuitemradio` cells, the one in force checked. The shared menu
// keyboard (useMenu) opens it on the checked cell, closes it on Escape, Tab or a press outside; the grid adds moving by
// cell (Left, Right) and by row (Up, Down). A choice runs the kind's action, which gives focus back to the writing. A
// grid may come in sections, each a group under its heading starting a row of its own (the PDF Stamp control's
// categories), and a cell may be a badge: words in a colour on the page's paper, as a stamp looks; a picture over its
// name (a custom stamp); or a command, a glyph over its words that runs rather than chooses (Create custom stamp…), a
// `menuitem` among the radios.
import type { KeyboardEvent } from 'react';
import { Glyph, Prims, useMenu } from '@livedoc/ui';
import type { IconPrim } from '@livedoc/icons';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { GRID_KEYS, gridStep, type GridKey } from '@/lib/office/grid-step';
import { ChoiceBadge, ChoiceLines, ChoicePicture } from './OfficeChoicePictures';

/** One line of a cell's preview: a marker at a level, then a bar standing for text, or a word. */
export type OfficeGridLine = {
  level: number;
  marker: string;
  // A checklist's box in the marker's place, ticked or not.
  box?: 'open' | 'ticked';
  // A word in the bar's place, struck through or not (a checklist with or without strikethrough).
  word?: { text: string; struck: boolean };
};

/** A badge's look: its words in capitals, a smaller second line, in its colour, as on the page. */
export type OfficeGridBadge = { text: string; detail: string | null; colour: string };

/** A picture's cell: the picture (its address; null while it is on its way, or failed), its name below. */
export type OfficeGridPicture = { src: string | null; name: string };

/**
 * A cell: a preview of lines (a list style), a glyph over its name (a tool, or with `command` an action that chooses
 * nothing), a badge (a stamp), or a picture (a custom stamp).
 */
export type OfficeGridCell =
  | { id: string; label: string; lines: readonly OfficeGridLine[] }
  | { id: string; label: string; icon: readonly IconPrim[]; command?: boolean }
  | { id: string; label: string; badge: OfficeGridBadge }
  | { id: string; label: string; picture: OfficeGridPicture };

/** A run of the grid's cells under a heading of its own. */
export type OfficeGridSection = { label: string; count: number };

/**
 * What a split toggle's chevron opens: cells, `columns` to a row, each run by the choice's action of its id; in
 * `sections`, the cells in order, so many to each; `wide` cells for a badge's words.
 */
export type OfficeGrid = {
  columns: number;
  cells: readonly OfficeGridCell[];
  sections?: readonly OfficeGridSection[];
  wide?: boolean;
};

/** A cell's width, in rem: a tool's or a list style's, and a badge's. */
const CELL_REM = 4.5;
const WIDE_CELL_REM = 6.5;

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
  const sections = grid.sections ?? [{ label: '', count: grid.cells.length }];
  const columns = `repeat(${grid.columns}, ${grid.wide ? WIDE_CELL_REM : CELL_REM}rem)`;
  // Up and Down by a row, Left and Right by a cell, ahead of the menu's own Up and Down.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!GRID_KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cells = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-office-grid-cell]')];
    const at = cells.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    // Handled here: neither the menu's keys nor the toolbar's (an ancestor in React's tree, through the portal) see it.
    e.preventDefault();
    e.stopPropagation();
    const sizes = sections.map((section) => section.count);
    cells[gridStep(at, sizes, grid.columns, e.key as GridKey)]?.focus({ preventScroll: true });
  };
  const cell = (cell: OfficeGridCell) => {
    const command = 'icon' in cell && cell.command === true;
    const checked = !command && cell.id === value;
    return (
      <button
        key={cell.id}
        type="button"
        role={command ? 'menuitem' : 'menuitemradio'}
        aria-checked={command ? undefined : checked}
        aria-label={cell.label}
        tabIndex={-1}
        data-office-grid-cell={cell.id}
        onClick={() => {
          onClose();
          actions[cell.id]?.run();
        }}
        className={`flex rounded-control border outline-none hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--office-focus) ${
          'badge' in cell
            ? 'min-h-11 items-stretch p-1'
            : 'picture' in cell
              ? 'h-20 items-stretch p-1'
              : 'h-14 items-start px-2 py-2'
        } ${checked ? 'border-(--office-focus) bg-(--office-pressed)' : 'border-(--office-line)'}`}
      >
        {'icon' in cell ? (
          <span className="flex w-full flex-col items-center gap-1 text-supporting leading-none text-(--office-ink)">
            <Glyph size={18} units={24}>
              <Prims prims={cell.icon} />
            </Glyph>
            {cell.label}
          </span>
        ) : 'badge' in cell ? (
          <ChoiceBadge badge={cell.badge} />
        ) : 'picture' in cell ? (
          <ChoicePicture picture={cell.picture} />
        ) : (
          <ChoiceLines lines={cell.lines} />
        )}
      </button>
    );
  };
  // Where each section's cells begin.
  const starts = sections.map((_, at) =>
    sections.slice(0, at).reduce((sum, section) => sum + section.count, 0),
  );
  return (
    <div
      ref={attach}
      {...surfaceProps}
      onKeyDownCapture={onKeyDownCapture}
      className="flex max-h-[min(32rem,80vh)] flex-col gap-2 overflow-y-auto rounded-menu border border-(--office-line) bg-(--office-menu) p-2 shadow-lg animate-fade-in motion-reduce:animate-none"
    >
      {sections.map((section, at) => {
        const cells = grid.cells.slice(starts[at], starts[at]! + section.count);
        const body = (
          <div className="grid gap-2" style={{ gridTemplateColumns: columns }}>
            {cells.map(cell)}
          </div>
        );
        return section.label === '' ? (
          <div key={`cells-${at}`}>{body}</div>
        ) : (
          <div
            key={section.label}
            role="group"
            aria-label={section.label}
            className="flex flex-col gap-1"
          >
            <span aria-hidden="true" className="px-0.5 text-supporting text-(--office-muted)">
              {section.label}
            </span>
            {body}
          </div>
        );
      })}
    </div>
  );
}
