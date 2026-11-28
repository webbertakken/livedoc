'use client';

// The frame a sheet object sits in over the cells (docs/specs/029-sheets/charts.md "Working with a chart",
// inserted-objects.md "Images over cells"): what a chart and an image share. Someone who may shape the sheet (an
// Editor) selects one by a click or Tab, drags it to move it, drags a handle to resize it, removes it with Delete or
// Backspace and lets it go with Escape; the arrow keys move it, Alt and the arrow keys resize it; a right-click opens
// its menu. Anyone else sees it, and the pointer passes through to the cells. The layer holding the frames keeps which
// is selected and how far one is dragged (useSheetObjectDrag); each object's own look is the frame's children.
import {
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Tooltip } from '@livedoc/ui';
import type { PlanPalette } from '@/components/plan/plan-palette';

// A press that moves less than this (sheet px) is a click, not a drag.
const DRAG_SLOP_PX = 3;
export const OBJECT_HANDLE_PX = 10;
// The element menu opens this far below its anchor (element-menu-opener); a right-click's opens at the pointer.
const MENU_GAP_PX = 4;
// Shift and an arrow move or resize an object this far (sheet px); an arrow alone, 1 px (the canvas's nudge steps).
const KEY_STEP_LARGE_PX = 10;
export const OBJECT_KEYS =
  'ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Delete Escape';
export const OBJECT_KEYS_HELP =
  'Arrow keys move it, Alt and the arrow keys resize it, Delete removes it, Escape lets it go.';

/** A drag under way: a move, or a resize by a handle (a compass point; a chart has only its corner, `se`). */
export type ObjectDrag = {
  id: string;
  kind: 'move' | 'resize';
  handle: string;
  dx: number;
  dy: number;
};

/** The drag of the objects in one layer: what is dragged now, and how a press starts one (committed on release). */
export function useSheetObjectDrag(opts: {
  editable: boolean;
  // Screen px per sheet px (the zooms above the layer).
  scale: () => number;
  select: (id: string) => void;
  commit: (drag: ObjectDrag) => void;
}): {
  drag: ObjectDrag | null;
  begin: (e: ReactPointerEvent, id: string, kind: ObjectDrag['kind'], handle?: string) => void;
} {
  const [drag, setDrag] = useState<ObjectDrag | null>(null);
  const { editable, scale: scaleOf, select, commit } = opts;
  const begin = (e: ReactPointerEvent, id: string, kind: ObjectDrag['kind'], handle = 'se') => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(id);
    e.currentTarget.closest<HTMLElement>('[data-sheet-object]')?.focus({ preventScroll: true });
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const scale = scaleOf();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last: ObjectDrag | null = null;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      if (!last && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      last = { id, kind, handle, dx, dy };
      setDrag(last);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', cancel);
      setDrag(null);
      if (last) commit(last);
    };
    const cancel = () => {
      last = null;
      end();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', cancel);
  };
  return { drag, begin };
}

/** Screen px per sheet px under `el`: the canvas zoom times the sheet's own (both transforms above the layer). */
export function layerScale(el: HTMLElement | null): number {
  return el && el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
}

export function SheetObjectFrame({
  id,
  kind,
  label,
  editable,
  selected,
  box,
  className,
  style,
  onPress,
  onSelect,
  onLeave,
  onRelease,
  onRemove,
  onNudge,
  onMenu,
  onOpen,
  controls,
  children,
}: {
  id: string;
  // Which object it is, as its data attribute (`data-sheet-chart`, `data-sheet-image`) names it.
  kind: 'chart' | 'image';
  label: string;
  editable: boolean;
  selected: boolean;
  // Where it is drawn, in the layer's px (scrolled).
  box: { left: number; top: number; width: number; height: number };
  className?: string;
  style?: CSSProperties;
  // A press on the frame (not its controls): the start of a move.
  onPress: (e: ReactPointerEvent) => void;
  onSelect: () => void;
  // Focus gone from it and its controls.
  onLeave: () => void;
  // Escape: let it go, the keys back to the grid.
  onRelease: () => void;
  onRemove: () => void;
  // An arrow key: moved by (dx, dy), or resized with Alt.
  onNudge: (dx: number, dy: number, resize: boolean) => void;
  // Its menu at a rect (a right-click's, at the pointer); absent while it has none.
  onMenu?: ((at: DOMRect) => void) | undefined;
  // A double-click.
  onOpen?: ((at: DOMRect) => void) | undefined;
  // Drawn over it while it is selected: its buttons and handles.
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-sheet-object={kind}
      {...{ [`data-sheet-${kind}`]: id }}
      role={editable ? 'group' : 'img'}
      aria-label={label}
      tabIndex={editable ? 0 : -1}
      // Escape lets a selected object go before it restores a maximised sheet.
      data-keeps-escape={selected ? '' : undefined}
      // Whether it is selected, for its keys and for tests to wait on before pressing them.
      data-selected={selected ? '' : undefined}
      className={`absolute outline-none ${className ?? ''} ${editable ? 'pointer-events-auto cursor-move' : ''}`}
      style={{ ...box, ...style }}
      // Taken on the way down, before the view under it (a chart's canvas gestures would drag or select it on the
      // canvas), except a press on the frame's own controls or on a chart's indicators.
      onPointerDownCapture={(e) => {
        if (!framePress(e)) return;
        e.stopPropagation();
        onPress(e);
      }}
      onPointerUpCapture={(e) => viewPress(e) && e.stopPropagation()}
      onClickCapture={(e) => viewPress(e) && e.stopPropagation()}
      onDoubleClickCapture={(e) => {
        if (!framePress(e)) return;
        e.stopPropagation();
        if (editable) onOpen?.(e.currentTarget.getBoundingClientRect());
      }}
      onContextMenuCapture={(e) => {
        if (!framePress(e)) return;
        e.stopPropagation();
        if (!editable) return;
        // Its menu at the pointer (as a right-click on the canvas opens an element's).
        e.preventDefault();
        onSelect();
        onMenu?.(new DOMRect(e.clientX, e.clientY - MENU_GAP_PX, 0, 0));
      }}
      aria-keyshortcuts={editable ? OBJECT_KEYS : undefined}
      aria-description={editable ? OBJECT_KEYS_HELP : undefined}
      onKeyDown={(e) => {
        if (!editable || e.target !== e.currentTarget) return;
        // A selected object's keys are its own: none reaches the grid or the canvas's shortcuts (a typed r would add a
        // rectangle), except undo and redo.
        if (isUndoChord(e)) return;
        e.stopPropagation();
        const step = arrowStep(e.key, e.shiftKey ? KEY_STEP_LARGE_PX : 1);
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onRemove();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onRelease();
        } else if (step) {
          // Arrows move it, Alt and the arrows resize it (the corner handle's keyboard way): one undo step each.
          e.preventDefault();
          onNudge(step.dx, step.dy, e.altKey);
        }
      }}
      onBlur={(e) => leftFrame(e) && onLeave()}
      onFocus={() => editable && onSelect()}
    >
      {children}
      {selected ? controls : null}
    </div>
  );
}

/** Where a selected object's buttons sit: its top left (a chart's indicators sit along its top right). */
export function SheetObjectButtons({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute left-1 top-1 flex gap-1"
      data-sheet-object-control
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** A selected object's button, drawn as the sheet's own controls are. */
export function SheetObjectButton({
  label,
  palette,
  menu,
  onClick,
  children,
}: {
  label: string;
  palette: PlanPalette;
  menu?: boolean;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup={menu ? 'menu' : undefined}
        // A menu trigger: the open menu's outside-press close leaves this press to the button (a toggle).
        data-context-menu-trigger={menu ? '' : undefined}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
          color: palette.text,
        }}
        onClick={onClick}
      >
        <span className="h-4 w-4">{children}</span>
      </button>
    </Tooltip>
  );
}

// Each handle's place on the box (a share of its width and height) and the cursor over it.
const HANDLE_PLACES: Record<string, { x: number; y: number; cursor: string }> = {
  nw: { x: 0, y: 0, cursor: 'nwse-resize' },
  n: { x: 0.5, y: 0, cursor: 'ns-resize' },
  ne: { x: 1, y: 0, cursor: 'nesw-resize' },
  e: { x: 1, y: 0.5, cursor: 'ew-resize' },
  se: { x: 1, y: 1, cursor: 'nwse-resize' },
  s: { x: 0.5, y: 1, cursor: 'ns-resize' },
  sw: { x: 0, y: 1, cursor: 'nesw-resize' },
  w: { x: 0, y: 0.5, cursor: 'ew-resize' },
};

/** A selected object's resize handles (pointer only: the keyboard resizes with Alt and the arrows). */
export function SheetObjectHandles({
  handles,
  palette,
  onPress,
}: {
  handles: readonly string[];
  palette: PlanPalette;
  onPress: (e: ReactPointerEvent, handle: string) => void;
}) {
  return (
    <>
      {handles.map((handle) => {
        const at = HANDLE_PLACES[handle]!;
        return (
          <div
            key={handle}
            aria-hidden
            data-sheet-object-handle={handle}
            data-sheet-object-control
            className="absolute rounded-sm border"
            style={{
              left: `calc(${at.x * 100}% - ${OBJECT_HANDLE_PX / 2}px)`,
              top: `calc(${at.y * 100}% - ${OBJECT_HANDLE_PX / 2}px)`,
              width: OBJECT_HANDLE_PX,
              height: OBJECT_HANDLE_PX,
              cursor: at.cursor,
              backgroundColor: palette.surface,
              borderColor: palette.focus,
            }}
            onPointerDown={(e) => onPress(e, handle)}
          />
        );
      })}
    </>
  );
}

// A frame's blur: selected no longer once focus leaves it and its controls.
function leftFrame(e: { relatedTarget: EventTarget | null; currentTarget: HTMLElement }): boolean {
  const next = e.relatedTarget;
  return !(next instanceof Node && e.currentTarget.contains(next));
}

// A press the frame takes: anything but its own controls (buttons, handles) and a chart's indicators (a comment or an
// action opens as it does on the canvas).
function framePress(e: { target: EventTarget }): boolean {
  const t = e.target as { closest?: (selector: string) => unknown };
  return !t.closest?.('[data-sheet-object-control], [data-indicators]');
}

// The rest of a press inside the view, kept from its canvas gestures. Never one on the frame itself: a drag's release
// lands there (pointer capture), and its own listener must hear it.
function viewPress(e: { target: EventTarget; currentTarget: EventTarget }): boolean {
  return e.target !== e.currentTarget && framePress(e);
}

// Undo and redo (Ctrl or ⌘ with Z, Shift for redo, or Ctrl+Y): the editor's, even from a selected object.
function isUndoChord(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  const k = e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y');
}

// The (dx, dy) an arrow key moves by, or null for any other key.
function arrowStep(key: string, n: number): { dx: number; dy: number } | null {
  if (key === 'ArrowLeft') return { dx: -n, dy: 0 };
  if (key === 'ArrowRight') return { dx: n, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: -n };
  if (key === 'ArrowDown') return { dx: 0, dy: n };
  return null;
}
