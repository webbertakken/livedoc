'use client';

// The slicers over a sheet (docs/specs/029-sheets/data-tools.md "Slicers"): each drawn at its anchor with its heading
// and what it keeps, scrolling and zooming with the cells. Pressing one (or Enter on it) opens its filter for this
// person alone; its ⋮ menu edits, sets the default, resets one's own and deletes. An Editor moves it by dragging its
// frame, resizes it by its corner, and uses the arrows (Alt to resize) and Delete once it is selected, each one undo
// step; anyone else changes only their own filter.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Tooltip } from '@livedoc/ui';
import {
  columnValueCounts,
  SLICER_SIZE_MAX,
  SLICER_SIZE_MIN,
  sheetSlicers,
  slicerCondition,
  type DrawnFilter,
  type FilterCondition,
  type SheetSlicer,
} from '@livedoc/sheets';
import { ContextMenu } from '@/components/palette/ContextMenu';
import { MenuActionRow } from '@/components/primitives/PortalMenu';
import { anchorAt, anchorPx } from '@/components/spreadsheet/charts/sheet-chart-place';
import { debugLog } from '@/lib/debug-log';
import { useSheetController } from '../sheet-controller';
import type { SheetActions } from '../useSheetActions';
import { FilterMenu } from '../FilterMenu';
import { ClearFormatIcon, DeleteIcon, FilterIcon, FormattingIcon, MoreIcon } from '../sheet-icons';
import { slicerColumns } from './slicer-columns';
import { SLICER_NO_COLUMN, SLICER_NO_DATA, slicerHeading, slicerKeeps } from './slicer-summary';
import { takePlacedSlicer, useSheetSlicerWrites } from './slicers-context';

const DRAG_SLOP_PX = 3;
const HANDLE_PX = 10;
const KEY_STEP_LARGE_PX = 10;
const SLICER_KEYS =
  'ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Delete Escape';
const SLICER_KEYS_HELP =
  'Arrow keys move it, Alt and the arrow keys resize it, Delete removes it, Escape lets it go.';

type Drag = { id: string; kind: 'move' | 'resize'; dx: number; dy: number };
type Open = { id: string; what: 'filter' | 'options'; at: { x: number; y: number } };

const clampSize = (v: number, least: number) =>
  Math.round(Math.min(SLICER_SIZE_MAX, Math.max(least, v)));

/** A slicer's box dragged by its corner (D483's bounds). */
export function resizedSlicer(s: Pick<SheetSlicer, 'width' | 'height'>, dx: number, dy: number) {
  return {
    width: clampSize(s.width + dx, SLICER_SIZE_MIN.width),
    height: clampSize(s.height + dy, SLICER_SIZE_MIN.height),
  };
}

export function SheetSlicersLayer({ actions }: { actions: SheetActions }) {
  const c = useSheetController();
  const writes = useSheetSlicerWrites();
  const layout = c.sheet.layout;
  const slicers = useMemo(() => sheetSlicers(layout), [layout]);
  const editable = !!writes && c.interactive && c.canShape;
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // A slicer this person just added is selected as it arrives, ready to move.
  useEffect(() => {
    const placed = slicers.find((x) => takePlacedSlicer(x.id));
    if (!placed || !editable) return;
    layerRef.current
      ?.querySelector<HTMLElement>(`[data-sheet-slicer="${placed.id}"]`)
      ?.focus({ preventScroll: true });
  }, [slicers, editable]);
  if (slicers.length === 0) return null;

  const byId = (id: string) => slicers.find((x) => x.id === id);
  const move = (s: SheetSlicer, dx: number, dy: number) => {
    const px = anchorPx(s.at, layout, c.geometry);
    return anchorAt({ x: px.x + dx, y: px.y + dy }, layout, c.geometry);
  };
  const commit = (s: SheetSlicer, kind: Drag['kind'], dx: number, dy: number) =>
    writes?.change(
      kind === 'move' ? { ...s, at: move(s, dx, dy) } : { ...s, ...resizedSlicer(s, dx, dy) },
      kind === 'move' ? 'moved' : 'resized',
    );
  const remove = (id: string) => {
    writes?.remove(id);
    setSelected(null);
    c.focusGrid();
  };
  const scaleOf = () => {
    const el = layerRef.current;
    return el && el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  };
  const begin = (e: ReactPointerEvent, s: SheetSlicer, kind: Drag['kind']) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(s.id);
    e.currentTarget.closest<HTMLElement>('[data-sheet-slicer]')?.focus({ preventScroll: true });
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const scale = scaleOf();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last: Drag | null = null;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      if (!last && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      last = { id: s.id, kind, dx, dy };
      setDrag(last);
    };
    const end = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', cancel);
      setDrag(null);
      if (last) commit(s, kind, last.dx, last.dy);
    };
    const cancel = () => {
      last = null;
      end();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', cancel);
  };
  const openAt = (id: string, what: Open['what'], el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ id, what, at: { x: r.left, y: r.bottom + 4 } });
  };

  const shownSlicer = open ? byId(open.id) : undefined;
  return (
    <div
      ref={layerRef}
      data-sheet-slicers
      // Inside role="grid", which may own only rows: the slicers sit in one row and cell of their own.
      role="row"
      aria-label="Slicers"
      className="pointer-events-none absolute inset-0 z-[7]"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-sheet-slicer]')) e.stopPropagation();
      }}
    >
      <div role="gridcell" className="absolute inset-0">
        {slicers.map((s) => {
          const d = drag?.id === s.id ? drag : null;
          const px = anchorPx(s.at, layout, c.geometry);
          const pos = d?.kind === 'move' ? { x: px.x + d.dx, y: px.y + d.dy } : px;
          const size = d?.kind === 'resize' ? resizedSlicer(s, d.dx, d.dy) : s;
          const isSelected = editable && selected === s.id;
          const { heading, keeps, filtering } = slicerFace(c, s);
          return (
            <div
              key={s.id}
              data-sheet-slicer={s.id}
              data-selected={isSelected ? '' : undefined}
              data-keeps-escape={isSelected ? '' : undefined}
              role="group"
              aria-label={`${heading} slicer`}
              tabIndex={editable ? 0 : -1}
              aria-keyshortcuts={editable ? SLICER_KEYS : undefined}
              aria-description={editable ? SLICER_KEYS_HELP : undefined}
              className={`pointer-events-auto absolute flex items-center gap-1 rounded-md border px-1 text-body shadow-sm outline-none ${editable ? 'cursor-move' : ''}`}
              style={{
                left: pos.x - c.scroll.left,
                top: pos.y - c.scroll.top,
                width: size.width,
                height: size.height,
                backgroundColor: c.palette.surface,
                borderColor: isSelected ? c.palette.focus : c.palette.border,
                color: c.palette.text,
                ...(isSelected
                  ? { outline: `2px solid ${c.palette.focus}`, outlineOffset: 1 }
                  : {}),
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('[data-slicer-control]')) return;
                begin(e, s, 'move');
              }}
              onFocus={() => editable && setSelected(s.id)}
              onBlur={(e) => {
                const next = e.relatedTarget;
                if (next instanceof Node && e.currentTarget.contains(next)) return;
                setSelected((x) => (x === s.id ? null : x));
              }}
              onKeyDown={(e) => {
                if (!editable || e.target !== e.currentTarget) return;
                const k = e.key.toLowerCase();
                if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) return;
                e.stopPropagation();
                const n = e.shiftKey ? KEY_STEP_LARGE_PX : 1;
                const step =
                  e.key === 'ArrowLeft'
                    ? { dx: -n, dy: 0 }
                    : e.key === 'ArrowRight'
                      ? { dx: n, dy: 0 }
                      : e.key === 'ArrowUp'
                        ? { dx: 0, dy: -n }
                        : e.key === 'ArrowDown'
                          ? { dx: 0, dy: n }
                          : null;
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  remove(s.id);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setSelected(null);
                  c.focusGrid();
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  openAt(s.id, 'filter', e.currentTarget);
                } else if (step) {
                  e.preventDefault();
                  commit(s, e.altKey ? 'resize' : 'move', step.dx, step.dy);
                }
              }}
            >
              <button
                type="button"
                data-slicer-control
                data-filtering={filtering ? '' : undefined}
                aria-haspopup="menu"
                aria-label={`${heading}: ${keeps}`}
                disabled={!s.range || !s.col}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded px-1 text-left disabled:cursor-default"
                onClick={(e) => openAt(s.id, 'filter', e.currentTarget)}
              >
                <span
                  className="h-4 w-4 shrink-0"
                  style={{ color: filtering ? c.palette.focus : c.palette.muted }}
                >
                  <FilterIcon />
                </span>
                <span className="min-w-0 truncate font-semibold">{heading}</span>
                <span className="ml-auto shrink-0 truncate" style={{ color: c.palette.muted }}>
                  {keeps}
                </span>
              </button>
              <Tooltip label="Slicer options">
                <button
                  type="button"
                  data-slicer-control
                  aria-label="Slicer options"
                  aria-haspopup="menu"
                  data-context-menu-trigger=""
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded"
                  onClick={(e) => openAt(s.id, 'options', e.currentTarget)}
                >
                  <span className="h-4 w-4">
                    <MoreIcon />
                  </span>
                </button>
              </Tooltip>
              {isSelected ? (
                <div
                  aria-hidden
                  data-slicer-control
                  data-sheet-slicer-resize
                  className="absolute cursor-nwse-resize rounded-sm border"
                  style={{
                    right: -HANDLE_PX / 2,
                    bottom: -HANDLE_PX / 2,
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                    backgroundColor: c.palette.surface,
                    borderColor: c.palette.focus,
                  }}
                  onPointerDown={(e) => begin(e, s, 'resize')}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {open && shownSlicer && open.what === 'filter' && shownSlicer.range && shownSlicer.col ? (
        <FilterMenu
          key={`${open.id}-${open.at.x}-${open.at.y}`}
          colId={shownSlicer.col}
          at={open.at}
          actions={actions}
          onClose={() => setOpen(null)}
          slicer={{
            label: `${slicerFace(c, shownSlicer).heading} slicer filter`,
            range: { ...shownSlicer.range, conds: {} },
            current: slicerCondition(shownSlicer, c.ownSlicers),
            apply: (cond) => {
              debugLog('[sheet] slicer filtered', { id: shownSlicer.id, own: true });
              c.setOwnSlicer(
                shownSlicer.id,
                sameCondition(cond, shownSlicer.filter) ? undefined : cond,
              );
            },
          }}
        />
      ) : null}
      {open && shownSlicer && open.what === 'options' ? (
        <SlicerOptions
          slicer={shownSlicer}
          at={open.at}
          editable={editable}
          onClose={() => setOpen(null)}
          onRemove={() => remove(shownSlicer.id)}
        />
      ) : null}
    </div>
  );
}

function SlicerOptions({
  slicer,
  at,
  editable,
  onClose,
  onRemove,
}: {
  slicer: SheetSlicer;
  at: { x: number; y: number };
  editable: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const c = useSheetController();
  const writes = useSheetSlicerWrites();
  const mine = c.ownSlicers[slicer.id];
  const own = mine !== undefined;
  const run = (f: () => void) => () => {
    f();
    onClose();
  };
  return (
    <ContextMenu position={at} label="Slicer options" onClose={onClose}>
      {editable && writes ? (
        <>
          <MenuActionRow
            label="Edit Slicer"
            icon={<FormattingIcon />}
            onClick={run(() => writes.edit(slicer.id))}
          />
          <MenuActionRow
            label="Set Current Filters as Default"
            icon={<FilterIcon />}
            disabled={!own}
            onClick={run(() => {
              const { filter: _was, ...rest } = slicer;
              debugLog('[sheet] slicer filtered', { id: slicer.id, own: false });
              if (writes.change(mine ? { ...rest, filter: mine } : rest, 'default set'))
                c.setOwnSlicer(slicer.id, undefined);
            })}
          />
        </>
      ) : null}
      <MenuActionRow
        label="Reset to Default"
        icon={<ClearFormatIcon />}
        disabled={!own}
        onClick={run(() => c.setOwnSlicer(slicer.id, undefined))}
      />
      {editable && writes ? (
        <MenuActionRow label="Delete Slicer" icon={<DeleteIcon />} onClick={run(onRemove)} />
      ) : null}
    </ContextMenu>
  );
}

// A slicer's heading, what it keeps for this person, and whether it hides anything.
function slicerFace(
  c: ReturnType<typeof useSheetController>,
  s: SheetSlicer,
): { heading: string; keeps: string; filtering: boolean } {
  const columns = slicerColumns(c, s);
  const header = columns.find((x) => x.id === s.col)?.label ?? '';
  const heading = slicerHeading(s.title, header || 'Slicer');
  if (!s.range) return { heading, keeps: SLICER_NO_DATA, filtering: false };
  if (!s.col || !columns.some((x) => x.id === s.col))
    return { heading, keeps: SLICER_NO_COLUMN, filtering: false };
  const cond = slicerCondition(s, c.ownSlicers);
  const range: DrawnFilter = { ...s.range, conds: {} };
  const count = cond?.values ? columnValueCounts(c.workbook, c.sheet.id, s.col, range).length : 0;
  return {
    heading,
    keeps: slicerKeeps(cond, count),
    filtering: !!cond && Object.keys(cond).length > 0,
  };
}

const sameCondition = (a: FilterCondition | null, b: FilterCondition | undefined) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
