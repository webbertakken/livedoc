'use client';

// The grid's pointer (docs/specs/029-sheets/sheet.md "Selection", "Fill", "Rows and columns", "Writing formulas";
//): select, extend and add ranges; drag the fill handle; resize, select and
// move rows and columns by their headers; point at cells while writing a formula; open the menus. Drags run on
// window listeners so they keep going outside the grid, and auto-scroll near its edges.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addRange,
  addSelection,
  extendTo,
  normaliseRange,
  selectAllCells,
  selectCols,
  selectRows,
  single,
  cellKey,
  displayValue,
  landingOf,
  hasValidation,
  validationRuleAt,
  type GridRange,
} from '@livedoc/sheets';
import { useAssignRef, useLatest } from '@/hooks/ui/useLatest';
import { pointingTargetFor } from './sheet-pointing';
import { useSheetController } from './sheet-controller';
import { cellBox, hitTest, mergeAt, totalSize, type Hit } from './sheet-geometry';
import { freezeCountAt, freezeEdgeUnder, freezeLineAt } from './sheet-freeze';
import { roomPerSheetPx } from './sheet-scroll-room';
import { fontPx } from './SheetCells';
import { ruleHitAt } from './rules/sheet-rule-draw';
import { FILL_HANDLE_PX, fillHandleAt } from './SheetSelectionLayer';
import { borderGrabAt, fillTargetFor } from './sheet-drag-targets';
import type { SheetActions } from './useSheetActions';
import { useSheetPan } from './useSheetPan';
import { openHyperlink } from '@/lib/open-hyperlink';
import { TOUCH_GRIP_HIT_PX, useSheetTouch } from './useSheetTouch';
import { useSheetTouchLink } from './useSheetTouchLink';
import { sheetPointerMenu } from './sheet-pointer-menu';
import { endDrag, linesWith, type Drag } from './sheet-drag-end';

const DRAG_START_PX = 4;
const AUTOSCROLL_EDGE_PX = 24;

// A cell or range pointed at while a formula is written; `sheet` names another sheet of the tab it is on.
export type PointRef = (
  from: { r: number; c: number },
  to: { r: number; c: number },
  sheet?: string,
) => boolean;

export function useSheetPointer(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  actions: SheetActions,
  pointRef: PointRef,
) {
  const c = useSheetController();
  const latest = useLatest(c);
  const drag = useRef<Drag | null>(null);
  const pan = useSheetPan(() => latest.current.gridEl);
  const [cursor, setCursor] = useState<string>('cell');
  // A preview of a drag in progress: the fill's target, a moved block's landing, a resize's line, a move's drop line.
  const [preview, setPreview] = useState<
    | { kind: 'fill' | 'block'; range: GridRange }
    | { kind: 'resize'; axis: 'r' | 'c'; at: number }
    | { kind: 'move'; axis: 'r' | 'c'; at: number }
    | null
  >(null);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The window's listeners during a drag: stable functions that call this render's handlers.
  const onMove = useRef<(e: PointerEvent) => void>(() => {});
  const onUp = useRef<(e: PointerEvent) => void>(() => {});
  const listeners = useMemo(
    () => ({
      move: (e: PointerEvent) => onMove.current(e),
      up: (e: PointerEvent) => onUp.current(e),
    }),
    [],
  );

  const local = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const scale = el.offsetWidth ? rect.width / el.offsetWidth : 1;
      return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    },
    [viewportRef],
  );

  const hitAt = (x: number, y: number): Hit =>
    hitTest(latest.current.geometry, x, y, latest.current.scroll);

  // The fill handle under a mouse; on a touch screen the same corner is the selection's grip (useSheetTouch), which
  // anyone who can select may drag, with a finger's reach.
  const onHandle = (x: number, y: number, grip = false) => {
    const cc = latest.current;
    if (cc.editing || (grip ? !cc.focused : !cc.canEdit)) return false;
    const reach = grip ? TOUCH_GRIP_HIT_PX : FILL_HANDLE_PX;
    const h = fillHandleAt(cc.geometry, cc.selectionNow(), cc.scroll);
    return (
      Math.abs(x - latest.current.geometry.headW - h.x) <= reach &&
      Math.abs(y - latest.current.geometry.headH - h.y) <= reach
    );
  };

  // The selection's border under a mouse, grabbed to move its cells (D145, D147): someone who may write cells,
  // not while editing or painting formats.
  const borderAt = (x: number, y: number): GridRange | null => {
    const cc = latest.current;
    if (cc.editing || !cc.canEdit || cc.rules.paint) return null;
    const g = cc.geometry;
    return borderGrabAt(g, cc.selectionNow(), cc.grid, cc.scroll, x - g.headW, y - g.headH);
  };

  // The frozen edge's bar (sheet-freeze.ts), for an Editor.
  const freezeEdgeAt = (x: number, y: number) =>
    latest.current.canEdit ? freezeEdgeUnder(latest.current.geometry, x, y) : null;

  // What a press on a cell hits of its validation rule's drawing (a box, a chip, an arrow), if anything.
  const ruleAtPress = (r: number, col: number, x: number, y: number) => {
    const cc = latest.current;
    if (!hasValidation(cc.sheet.layout)) return null;
    const rule = validationRuleAt(cc.sheet.layout, r, col);
    if (!rule) return null;
    const g = cc.geometry;
    const m = mergeAt(g, r, col);
    const rowId = cc.sheet.layout.rows[r]!;
    const colId = cc.sheet.layout.cols[col]!;
    const f = cc.sheet.cells.get(cellKey(rowId, colId))?.format;
    const shown = displayValue(cc.workbook.value(cc.sheet.id, r, col), f, cc.locale).text;
    const active = cc.selectionNow().active;
    return ruleHitAt(
      {
        rule,
        box: cellBox(g, r, col, cc.scroll, m),
        shown,
        px: fontPx(f),
        active: active.r === r && active.c === col,
      },
      x - g.headW,
      y - g.headH,
    );
  };

  // The cell under a point, clamped to the grid (a drag past the edge keeps the edge's cell).
  const cellAt = (x: number, y: number): { r: number; c: number } => {
    const cc = latest.current;
    // Past the last row or column (a grid smaller than its frame), the drag keeps the edge's cell.
    const total = totalSize(cc.geometry);
    const right = latest.current.geometry.headW + total.width - cc.scroll.left - 1;
    const bottom = latest.current.geometry.headH + total.height - cc.scroll.top - 1;
    const hx = Math.max(latest.current.geometry.headW + 1, Math.min(x, cc.view.width - 2, right));
    const hy = Math.max(latest.current.geometry.headH + 1, Math.min(y, cc.view.height - 2, bottom));
    const h = hitAt(hx, hy);
    if (h.kind === 'cell') return { r: h.r, c: h.c };
    return cc.selectionNow().active;
  };

  const step = () => {
    const d = drag.current;
    const cc = latest.current;
    if (!d) return;
    const { x, y } = pointer.current;
    if (d.kind === 'select' || d.kind === 'point') {
      const at = cellAt(x, y);
      if (d.kind === 'point') {
        if (d.sheet) pointingTargetFor(cc.sheet.id, cc.sheet.tabId)?.point(d.from, at, d.sheet);
        else pointRef(d.from, at);
      } else cc.setSelection(extendTo(cc.selectionNow(), at, cc.grid));
    } else if (d.kind === 'fill') {
      d.target = fillTargetFor(d.source, cellAt(x, y));
      setPreview({ kind: 'fill', range: d.target });
    } else if (d.kind === 'cellMove') {
      if (!d.armed && Math.hypot(x - d.x0, y - d.y0) < DRAG_START_PX) return;
      d.armed = true;
      const at = cellAt(x, y);
      const top = { r: at.r - d.grab.r, c: at.c - d.grab.c };
      d.landing = landingOf(d.source, top, cc.grid.rows, cc.grid.cols);
      setPreview({ kind: 'block', range: d.landing });
    } else if (d.kind === 'resize') {
      const delta = (d.axis === 'c' ? x : y) - d.start;
      d.px = Math.max(d.axis === 'c' ? 24 : 18, Math.round(d.size + delta));
      setPreview({ kind: 'resize', axis: d.axis, at: d.axis === 'c' ? x : y });
    } else if (d.kind === 'freeze') {
      d.count = freezeCountAt(cc.geometry, cc.view, cc.scroll, d.axis, x, y);
      const line = freezeLineAt(cc.geometry, cc.scroll, d.axis, d.count);
      setPreview({ kind: 'move', axis: d.axis, at: line });
    } else if (d.kind === 'axisSelect') {
      const h = hitAt(
        d.axis === 'c' ? x : latest.current.geometry.headW - 1,
        d.axis === 'r' ? y : latest.current.geometry.headH - 1,
      );
      const picked =
        h.kind === 'col' && d.axis === 'c'
          ? selectCols(d.from, h.c, cc.grid)
          : h.kind === 'row' && d.axis === 'r'
            ? selectRows(d.from, h.r, cc.grid)
            : null;
      if (picked) cc.setSelection(d.base ? addSelection(d.base, picked) : picked);
    } else if (d.kind === 'axisMove') {
      if (!d.armed && Math.hypot(x - d.x0, y - d.y0) < DRAG_START_PX) return;
      d.armed = true;
      const g = cc.geometry;
      const h = hitAt(
        d.axis === 'c' ? x : latest.current.geometry.headW - 1,
        d.axis === 'r' ? y : latest.current.geometry.headH - 1,
      );
      const i = h.kind === 'col' ? h.c : h.kind === 'row' ? h.r : d.drop;
      const offs = d.axis === 'c' ? g.cols : g.rows;
      const mid = (offs[i]! + offs[i + 1]!) / 2 - (d.axis === 'c' ? cc.scroll.left : cc.scroll.top);
      const p =
        d.axis === 'c' ? x - latest.current.geometry.headW : y - latest.current.geometry.headH;
      d.drop = p > mid ? i + 1 : i;
      const lineAt = offs[d.drop]! - (d.axis === 'c' ? cc.scroll.left : cc.scroll.top);
      setPreview({ kind: 'move', axis: d.axis, at: lineAt });
    }
  };

  // Near an edge while dragging, the grid scrolls (faster the closer), and the drag follows.
  const autoscroll = () => {
    const el = latest.current.gridEl;
    const d = drag.current;
    if (!el || !d || d.kind === 'resize') return;
    const { x, y } = pointer.current;
    const { width, height } = latest.current.view;
    const dx =
      x < latest.current.geometry.headW + AUTOSCROLL_EDGE_PX
        ? -1
        : x > width - AUTOSCROLL_EDGE_PX
          ? 1
          : 0;
    const dy =
      y < latest.current.geometry.headH + AUTOSCROLL_EDGE_PX
        ? -1
        : y > height - AUTOSCROLL_EDGE_PX
          ? 1
          : 0;
    if (!dx && !dy) return;
    // A step of 24 sheet px, however large the sheet's scroll room makes a room px (sheet-scroll-room.ts).
    const per = roomPerSheetPx(el);
    el.scrollBy({ left: dx * 24 * per.x, top: dy * 24 * per.y });
    step();
  };
  const onTick = useRef<() => void>(() => {});
  useAssignRef(onTick, autoscroll);

  // A drag's end: what it made, applied once.
  const finish = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPreview(null);
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    window.removeEventListener('pointercancel', listeners.up);
    if (d) endDrag(d, e, latest.current, actions);
  };
  const follow = (e: PointerEvent) => {
    pointer.current = local(e.clientX, e.clientY);
    step();
  };
  useAssignRef(onMove, follow);
  useAssignRef(onUp, finish);

  // A cancelled pointer (the browser took the gesture) ends the drag where it last was.
  const begin = (d: Drag, e: { clientX: number; clientY: number }) => {
    drag.current = d;
    pointer.current = local(e.clientX, e.clientY);
    window.addEventListener('pointermove', listeners.move);
    window.addEventListener('pointerup', listeners.up);
    window.addEventListener('pointercancel', listeners.up);
    timer.current = setInterval(() => onTick.current(), 50);
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', listeners.move);
      window.removeEventListener('pointerup', listeners.up);
      window.removeEventListener('pointercancel', listeners.up);
      if (timer.current) clearInterval(timer.current);
    },
    [listeners],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const cc = latest.current;
    if (!cc.interactive) return;
    // A press on the grid lets a Smart Fill offer go (D150); its card keeps its own presses.
    if (cc.smartFill) cc.setSmartFill(null);
    // A finger pans, holds or drags the grip (useSheetTouch).
    if (e.pointerType === 'touch') return touch.onTouchDown(e);
    // Panning the cells (useSheetPan): the middle or right button, Space with the left.
    if (pan.begin(e, { maximised: cc.maximised })) return;
    e.stopPropagation();
    if (e.button === 2) return;
    const { x, y } = local(e.clientX, e.clientY);
    if (onHandle(x, y)) {
      e.preventDefault();
      const source = cc.selectionNow().ranges[cc.selectionNow().ranges.length - 1]!;
      begin({ kind: 'fill', source, target: source, copy: e.ctrlKey || e.altKey }, e);
      return;
    }
    const h = hitAt(x, y);
    // The outline bands' controls are buttons of their own; the band itself selects nothing.
    if (h.kind === 'band') return;
    const grabbed = h.kind === 'cell' ? borderAt(x, y) : null;
    if (grabbed && h.kind === 'cell') {
      e.preventDefault();
      cc.focusGrid();
      const grab = {
        r: Math.min(Math.max(h.r, grabbed.r1), grabbed.r2) - grabbed.r1,
        c: Math.min(Math.max(h.c, grabbed.c1), grabbed.c2) - grabbed.c1,
      };
      setCursor('grabbing');
      begin(
        {
          kind: 'cellMove',
          source: grabbed,
          grab,
          press: { r: h.r, c: h.c },
          landing: grabbed,
          armed: false,
          x0: x,
          y0: y,
        },
        e,
      );
      return;
    }
    if (h.kind === 'cell') {
      // Another sheet of the tab is writing a formula: this sheet's cell goes in it (the editor keeps the caret).
      const into = cc.editing ? null : pointingTargetFor(cc.sheet.id, cc.sheet.tabId);
      if (into?.point({ r: h.r, c: h.c }, { r: h.r, c: h.c }, cc.sheet.title)) {
        e.preventDefault();
        begin({ kind: 'point', from: { r: h.r, c: h.c }, sheet: cc.sheet.title }, e);
        return;
      }
      // While a formula is written, a click on a cell where a reference can go puts it there.
      if (cc.editing && pointRef({ r: h.r, c: h.c }, { r: h.r, c: h.c })) {
        e.preventDefault();
        begin({ kind: 'point', from: { r: h.r, c: h.c } }, e);
        return;
      }
      if (cc.editing) {
        const r = actions.commitEdit('none');
        if (!r.ok) return;
      }
      e.preventDefault();
      cc.focusGrid();
      // Ctrl/⌘ and a click on a HYPERLINK opens it in a new tab (formulas.md "Text"); on any other cell it adds to
      // the selection as before, and a plain click on a link only selects it.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !cc.rules.paint) {
        const link = cc.workbook.hyperlinkOf(cc.sheet.id, h.r, h.c);
        if (link) {
          openHyperlink(link);
          return;
        }
      }
      // A press on a checkbox's box toggles it; on a chip or a dropdown's arrow, opens its options
      // (data-validation.md "Using a dropdown", "Using a checkbox"). Paint Format paints instead.
      const ruleHit =
        e.shiftKey || e.metaKey || e.ctrlKey || cc.rules.paint ? null : ruleAtPress(h.r, h.c, x, y);
      if (ruleHit) {
        cc.setSelection(single({ r: h.r, c: h.c }));
        if (ruleHit === 'box') actions.toggleCheckboxes([{ r1: h.r, c1: h.c, r2: h.r, c2: h.c }]);
        else actions.openDropdown({ r: h.r, c: h.c });
        return;
      }
      if (e.shiftKey) cc.setSelection(extendTo(cc.selectionNow(), { r: h.r, c: h.c }, cc.grid));
      else if (e.metaKey || e.ctrlKey)
        cc.setSelection(addRange(cc.selectionNow(), { r: h.r, c: h.c }, cc.grid));
      else cc.setSelection(extendTo(single({ r: h.r, c: h.c }), { r: h.r, c: h.c }, cc.grid));
      begin({ kind: 'select', additive: e.metaKey || e.ctrlKey }, e);
      return;
    }
    const freezeAxis = freezeEdgeAt(x, y);
    if (freezeAxis) {
      e.preventDefault();
      cc.focusGrid();
      const count = freezeAxis === 'c' ? cc.geometry.frozenCols : cc.geometry.frozenRows;
      begin({ kind: 'freeze', axis: freezeAxis, count }, e);
      return;
    }
    if (h.kind === 'corner') {
      cc.setSelection(selectAllCells(cc.grid));
      cc.focusGrid();
      return;
    }
    if (h.kind === 'col' || h.kind === 'row') {
      e.preventDefault();
      cc.focusGrid();
      const axis = h.kind === 'col' ? 'c' : 'r';
      const index = h.kind === 'col' ? h.c : h.r;
      if (h.edge && cc.canEdit) {
        begin(
          {
            kind: 'resize',
            axis,
            index,
            start: axis === 'c' ? x : y,
            size: actions.sizeOf(axis, index),
            px: actions.sizeOf(axis, index),
          },
          e,
        );
        return;
      }
      const sel = cc.selectionNow().ranges[cc.selectionNow().ranges.length - 1]!;
      const whole =
        axis === 'c'
          ? sel.r1 === 0 && sel.r2 >= cc.grid.rows - 1
          : sel.c1 === 0 && sel.c2 >= cc.grid.cols - 1;
      const [a, b] = axis === 'c' ? [sel.c1, sel.c2] : [sel.r1, sel.r2];
      const adding = e.metaKey || e.ctrlKey;
      if (whole && index >= a && index <= b && cc.canEdit && !e.shiftKey && !adding) {
        begin(
          { kind: 'axisMove', axis, from: a, to: b, drop: index, armed: false, x0: x, y0: y },
          e,
        );
        return;
      }
      const from = e.shiftKey
        ? axis === 'c'
          ? cc.selectionNow().anchor.c
          : cc.selectionNow().anchor.r
        : index;
      const picked =
        axis === 'c' ? selectCols(from, index, cc.grid) : selectRows(from, index, cc.grid);
      const base = adding && !e.shiftKey ? cc.selectionNow() : null;
      cc.setSelection(base ? addSelection(base, picked) : picked);
      begin({ kind: 'axisSelect', axis, from, base }, e);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current || !latest.current.interactive) return;
    const { x, y } = local(e.clientX, e.clientY);
    if (onHandle(x, y)) return setCursor('crosshair');
    const freezeAxis = freezeEdgeAt(x, y);
    if (freezeAxis) return setCursor(freezeAxis === 'c' ? 'ew-resize' : 'ns-resize');
    const h = hitAt(x, y);
    if (h.kind === 'cell' && borderAt(x, y)) {
      setHover({ r: h.r, c: h.c });
      return setCursor('grab');
    }
    setCursor(
      h.kind === 'col' && h.edge && latest.current.canEdit
        ? 'col-resize'
        : h.kind === 'row' && h.edge && latest.current.canEdit
          ? 'row-resize'
          : h.kind === 'cell'
            ? latest.current.rules.paint
              ? 'copy'
              : 'cell'
            : 'default',
    );
    setHover(h.kind === 'cell' ? { r: h.r, c: h.c } : null);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cc = latest.current;
    if (!cc.interactive) return;
    e.stopPropagation();
    const { x, y } = local(e.clientX, e.clientY);
    if (onHandle(x, y)) {
      // Fill down as far as the column beside the selection is filled.
      const s = cc.selectionNow().ranges[cc.selectionNow().ranges.length - 1]!;
      const beside = s.c1 > 0 ? s.c1 - 1 : s.c2 + 1;
      let r = s.r2;
      while (r + 1 < cc.grid.rows && cc.grid.filled(r + 1, beside)) r++;
      if (r > s.r2) actions.fill(s, { ...s, r2: r }, false);
      return;
    }
    const h = hitAt(x, y);
    if (h.kind === 'cell' && cc.canEdit) actions.startEdit('cell');
    if ((h.kind === 'col' || h.kind === 'row') && h.edge && cc.canEdit) {
      const axis = h.kind === 'col' ? 'c' : 'r';
      actions.autofit(axis, linesWith(cc, axis, h.kind === 'col' ? h.c : h.r));
    }
  };

  // The menus (sheet-pointer-menu.ts), built in the handlers that use them, reading this render's helpers.
  const menu = () => sheetPointerMenu({ controller: latest, local, hitAt, pan });
  const selectFor = (h: Hit) => menu().selectFor(h);
  const openMenu = (clientX: number, clientY: number) => menu().openMenu(clientX, clientY);
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => menu().onContextMenu(e);

  const touchLink = useSheetTouchLink();
  const touch = useSheetTouch({
    interactive: c.interactive,
    maximised: c.maximised,
    pan,
    local,
    hitAt,
    onGrip: (x, y) => onHandle(x, y, true),
    grab: (h) => {
      if (latest.current.editing) actions.commitEdit('none');
      selectFor(h);
    },
    extend: (from, clientX, clientY) => {
      const cc = latest.current;
      cc.focusGrid();
      if (from === 'grip') {
        // The grip drags the range's far corner: its top left stays put.
        const now = cc.selectionNow();
        const last = now.ranges[now.ranges.length - 1]!;
        cc.setSelection({ ...now, anchor: { r: last.r1, c: last.c1 } });
        begin({ kind: 'select', additive: false }, { clientX, clientY });
      } else if (from.kind === 'cell') {
        cc.setSelection(single({ r: from.r, c: from.c }));
        begin({ kind: 'select', additive: false }, { clientX, clientY });
      } else {
        const axis = from.kind === 'col' ? 'c' : 'r';
        const index = from.kind === 'col' ? from.c : from.r;
        cc.setSelection(
          axis === 'c' ? selectCols(index, index, cc.grid) : selectRows(index, index, cc.grid),
        );
        begin({ kind: 'axisSelect', axis, from: index, base: null }, { clientX, clientY });
      }
    },
    openMenu,
  });

  // A tap on a touch screen selects the cell, row or column under it, or the whole sheet from the corner (a finger's
  // drag pans the cells, useSheetPan, or scrolls them maximised).
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cc = latest.current;
    if (!cc.interactive || (e.nativeEvent as PointerEvent).pointerType !== 'touch') return;
    e.stopPropagation();
    if (pan.swallowClick() || touch.swallowTap()) return;
    const { x, y } = local(e.clientX, e.clientY);
    const h = hitAt(x, y);
    if (h.kind === 'none' || h.kind === 'band') return;
    if (cc.editing) actions.commitEdit('none');
    if (h.kind === 'cell') {
      // A link under the finger: Ctrl/⌘ and the tap open it; a plain tap marks it for the link chip (formulas.md
      // "Text").
      const link = cc.workbook.hyperlinkOf(cc.sheet.id, h.r, h.c);
      if (touchLink.tap(e, { r: h.r, c: h.c }, link, !!cc.rules.paint)) return;
      cc.setSelection(single({ r: h.r, c: h.c }));
    } else {
      touchLink.dismiss();
      if (h.kind === 'col') cc.setSelection(selectCols(h.c, h.c, cc.grid));
      else if (h.kind === 'row') cc.setSelection(selectRows(h.r, h.r, cc.grid));
      else cc.setSelection(selectAllCells(cc.grid));
    }
    cc.focusGrid();
  };

  return {
    pan,
    onPointerDown,
    onPointerMove,
    onDoubleClick,
    onContextMenu,
    onClick,
    cursor,
    preview,
    hover,
    ring: touch.ring,
    touchLink,
    normaliseRange,
  };
}
