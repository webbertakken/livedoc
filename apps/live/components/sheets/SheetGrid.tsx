'use client';

// The grid (docs/specs/029-sheets/sheet.md "The grid"): a
// native scroll container over a spacer the size of the whole sheet, with a sticky viewport inside that draws only
// what is in view: the cells, the headers, the selection, the editor. One tab stop; its keys are the grid's while it
// has focus, and Escape hands them back to the canvas.
import { keyLabel } from '@/lib/key-label';
import { usePlan } from '@/components/plan/PlanContext';
import { cardFieldChoice } from './card-field-options';
import { SheetCardRows } from './SheetCardRows';
import { SheetCellSlot } from './SheetCellSlot';
import { SheetRuleLayer } from './rules/SheetRuleLayer';
import { invalidWhy } from './rules/sheet-rule-hover';
import { SheetTouchLinkChip } from './SheetTouchLinkChip';
import { previewFormatRules } from './rules/useSheetRulesState';
import { SheetSmartFillLayer } from './SheetSmartFillLayer';
import { SheetSplitChip } from './SheetSplitChip';
import { SheetCellComments } from './SheetCellComments';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { TableChipsHostContext } from './tables/table-settings-context';
import { displayValue, isError, posRangeOf, single } from '@livedoc/sheets';
import { useSheetController } from './sheet-controller';
import { SheetProtectionLayer } from './SheetProtectionLayer';
import { SheetTablesLayer } from './tables/SheetTablesLayer';
import { SheetGroupBands } from './SheetGroupBands';
import { SheetPivotsLayer } from './pivots/SheetPivotsLayer';
import { SheetCells } from './SheetCells';
import { SheetHeaders } from './SheetHeaders';

// A filter view's header look: Google's dark grey, light numbers (8.7:1).
const FILTER_VIEW_HEADERS = { column: '#3c4043', muted: '#e8eaed', cardBorder: '#5f6368' } as const;
import { SheetOutlineBar } from './SheetOutlineBar';
import { SheetSelectionLayer, type Outline } from './SheetSelectionLayer';
import { SheetCellEditor } from './SheetCellEditor';
import { SheetChartsLayer } from './SheetChartsLayer';
import { SheetSlicersLayer } from './slicers/SheetSlicersLayer';
import { SheetImagesLayer } from './SheetImagesLayer';
import { ADD_ROWS_PX, SheetAddRows, roomFor } from './SheetAddRows';
import { cellBox, inWindow, scrollToReveal, totalSize, visibleWindow } from './sheet-geometry';
import { useSheetGridKeys, type SheetSurfaceKeys } from './useSheetGridKeys';
import { domScrollOf, keepScrollRoom, scrollRoom, sheetScrollOf } from './sheet-scroll-room';
import { mirrorCellId, SheetGridMirror } from './SheetGridMirror';
import { refSpans, spanRange } from './formula-assist';
import { useSheetPointer, type PointRef } from './useSheetPointer';
import { useSheetClipboard } from './useSheetClipboard';
import { sheetPresenceFor } from './sheet-presence-store';
import type { SheetActions } from './useSheetActions';
import type { FormulaInput } from './useFormulaInput';
import { ShowFormulasContext } from './show-formulas';
import type { SheetPeer } from '@/hooks/sheets/useSheetsBridge';
import { useCoarsePointer } from '@/hooks/ui/useCoarsePointer';
import { LongPressRing } from '@/components/primitives/LongPressRing';

type Props = {
  elementId: string;
  actions: SheetActions;
  input: FormulaInput;
  pointRef: PointRef;
  peers: readonly SheetPeer[];
  fontFamily?: string;
  // The sheet's zoom while it covers the canvas (sheet-zoom.ts); 1 elsewhere.
  zoom?: number;
  // A spreadsheet's own keys: the next sheet, the summary (useSheetGridKeys).
  surfaceKeys?: SheetSurfaceKeys;
};

// Find's matches: a soft yellow, as a spreadsheet marks them.
const FIND_HIGHLIGHT = '#facc15';

export function SheetGrid({
  elementId,
  actions,
  input,
  pointRef,
  peers,
  fontFamily,
  zoom = 1,
  surfaceKeys,
}: Props) {
  const c = useSheetController();
  // View › Show › Formulas, the spreadsheet surface's (D141); off in a Plan Sheet.
  const showFormulas = useContext(ShowFormulasContext);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointer = useSheetPointer(viewportRef, actions, pointRef);
  // Under a finger the selection's corner is a grip anyone who can select may drag (useSheetTouch).
  const coarse = useCoarsePointer();
  const clipboard = useSheetClipboard();
  const total = totalSize(c.geometry);
  // Room under the last row for Add Rows, for someone who may edit.
  const footer =
    (c.canShape ?? c.canEdit) && roomFor(c.workbook, c.sheet).rows > 0 ? ADD_ROWS_PX : 0;
  // The scroll container's room: the sheet's size, or less where the sheet outgrows a browser's ceiling.
  const room = scrollRoom(
    {
      width: c.geometry.headW + total.width,
      height: c.geometry.headH + total.height + footer,
    },
    c.view,
  );
  const window = visibleWindow(c.geometry, c.scroll, {
    width: Math.max(0, c.view.width - c.geometry.headW),
    height: Math.max(0, c.view.height - c.geometry.headH),
  });
  const presence = sheetPresenceFor(c.store);
  const presenceVersion = useSyncExternalStore(
    presence.subscribe,
    presence.getVersion,
    presence.getVersion,
  );

  // The grid's size, for the window; its scroll, for what is drawn.
  useLayoutEffect(() => {
    const el = c.gridEl;
    if (!el) return;
    const measure = () => c.setView({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [c.gridEl, c.setView]); // oxlint-disable-line react/exhaustive-deps

  // The room kept for pans and edge drags; a room that changes (rows added or deleted) reads the sheet's scroll afresh.
  const { x: ratioX, y: ratioY } = room.ratio;
  useLayoutEffect(() => {
    const el = c.gridEl;
    if (!el) return;
    keepScrollRoom(el, room);
    const now = sheetScrollOf(room, { top: el.scrollTop, left: el.scrollLeft });
    if (now.top !== c.scroll.top || now.left !== c.scroll.left) c.setScroll(now);
  }, [c.gridEl, ratioX, ratioY]); // oxlint-disable-line react/exhaustive-deps

  // The wheel scrolls the grid, not the canvas, while the grid can scroll that way (as a board's body).
  useEffect(() => {
    const el = c.gridEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || !c.interactive) return;
      const canY = el.scrollHeight > el.clientHeight;
      const canX = el.scrollWidth > el.clientWidth;
      if ((canY && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) || (canX && e.deltaX !== 0))
        e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [c.gridEl, c.interactive]);

  // Keep the active cell in view as it moves, and bring it back on Ctrl+Backspace.
  const { r: ar, c: ac } = c.selection.active;
  const revealActive = () => {
    const el = c.gridEl;
    if (!el) return;
    const next = scrollToReveal(c.geometry, ar, ac, c.scroll, {
      width: c.view.width - c.geometry.headW,
      height: c.view.height - c.geometry.headH,
    });
    if (next) el.scrollTo(domScrollOf(room, next));
  };
  // Once more when the grid first has its size, so a sheet opened on a range far down (a named range gone to from
  // another sheet) shows it.
  const sized = !!c.gridEl && c.view.width > 0 && c.view.height > 0;
  useEffect(revealActive, [ar, ac, sized]); // oxlint-disable-line react/exhaustive-deps

  // This person's selection, said to the room (useSheetPresence's store throttles it).
  useEffect(() => {
    const ranges = c.selection.ranges
      .map((g) => {
        const rows = c.sheet.layout.rows;
        const cols = c.sheet.layout.cols;
        return rows[g.r1] && cols[g.c1] && rows[g.r2] && cols[g.c2]
          ? { r1: rows[g.r1]!, c1: cols[g.c1]!, r2: rows[g.r2]!, c2: cols[g.c2]! }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    presence.say({
      kind: 'sheet-presence',
      tabId: c.sheet.tabId,
      sheetId: c.sheet.id,
      ranges,
      editing: !!c.editing,
    });
  }, [c.selection, c.editing, c.sheet, presence]);
  useEffect(
    () => () =>
      presence.say({
        kind: 'sheet-presence',
        tabId: c.sheet.tabId,
        sheetId: c.sheet.id,
        ranges: null,
        editing: false,
      }),
    [presence, c.sheet.id, c.sheet.tabId],
  );

  const outlines = useMemo<Outline[]>(() => {
    const out: Outline[] = [];
    // The references a formula being written names, in their colours.
    if (c.editing?.draft.startsWith('=')) {
      for (const span of refSpans(c.editing.draft)) {
        const r = spanRange(span);
        if (r) out.push({ range: r, color: span.colour, dashed: true });
      }
    }
    // Each peer's selection, in their colour, named.
    const byId = new Map(peers.map((p) => [p.id, p]));
    for (const [id, sel] of presence.on(c.sheet.id, c.sheet.tabId)) {
      const peer = byId.get(id);
      if (!peer) continue;
      sel.ranges.forEach((ids, i) => {
        const p = posRangeOf(c.sheet.layout, ids);
        if (!p) return;
        const hover =
          !!pointer.hover &&
          sel.ranges.some((ids) => {
            const g = posRangeOf(c.sheet.layout, ids);
            return (
              !!g &&
              pointer.hover!.r >= g.r1 &&
              pointer.hover!.r <= g.r2 &&
              pointer.hover!.c >= g.c1 &&
              pointer.hover!.c <= g.c2
            );
          });
        out.push({
          range: p,
          color: peer.color,
          thick: sel.editing,
          ...(i === 0 ? { label: peer.name, labelAt: sel.at, labelHover: hover } : {}),
        });
      });
    }
    // Find's matches in view.
    for (const h of c.findHits)
      if (inWindow(window, h.r, h.c))
        out.push({
          range: { r1: h.r, c1: h.c, r2: h.r, c2: h.c },
          color: FIND_HIGHLIGHT,
          highlight: true,
        });
    return out;
    // `presence` is the store itself (stable); `presenceVersion` says when it moved.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [
    c.editing?.draft,
    peers,
    c.sheet.id,
    c.sheet.layout,
    presenceVersion,
    c.findHits,
    window,
    pointer.hover,
  ]);

  // A card table's set-value columns keep room for their dropdown arrow (SheetCardRows).
  const plan = usePlan();
  const tables = c.sheet.layout.cardTables;
  const dropdownCols = useMemo(() => {
    const out = new Set<string>();
    if (!plan || !c.interactive || !c.canEdit) return out;
    for (const t of tables ?? [])
      for (const col of t.cols) if (cardFieldChoice(col.field, plan)) out.add(col.c);
    return out;
  }, [tables, plan, c.interactive, c.canEdit]);

  // The format rules as drawn: with the one being edited in its place, for its editor alone.
  const formatRules = useMemo(
    () => previewFormatRules(c.sheet.layout.formatRules, c.rules.formatPreview),
    [c.sheet.layout.formatRules, c.rules.formatPreview],
  );

  // The filter drawn: the open filter view's in the sheet filter's place (useFilterViews).
  const drawnFilter = c.filterViews.drawn;
  // While a filter view is open its row numbers and column letters are drawn dark, so a view is never mistaken for
  // the sheet (data-tools.md "The view bar").
  const viewOpen = !!c.filterViews.open;
  const headerPalette = useMemo(
    () => (viewOpen ? { ...c.palette, ...FILTER_VIEW_HEADERS } : c.palette),
    [viewOpen, c.palette],
  );
  const filter = useMemo(() => {
    const f = drawnFilter;
    const p = f ? posRangeOf(c.sheet.layout, f) : null;
    if (!f || !p) return null;
    const cols = [];
    for (let col = p.c1; col <= p.c2; col++) {
      const colId = c.sheet.layout.cols[col]!;
      cols.push({ c: col, colId, active: !!f.conds[colId] });
    }
    return { r: p.r1, cols };
  }, [c.sheet.layout, drawnFilter]);
  // The header cells that show a filter button keep room for it (SheetCells); a stable object, so the memoised cells
  // draw again only when the filter changes.
  const filterHead = useMemo(
    () =>
      filter && c.interactive ? { r: filter.r, cols: new Set(filter.cols.map((x) => x.c)) } : null,
    [filter, c.interactive],
  );

  const onKeyDown = useSheetGridKeys({
    elementId,
    actions,
    pan: pointer.pan,
    clipboard,
    reveal: revealActive,
    surface: surfaceKeys,
  });

  // The error under the pointer says why (sheet.md "The grid"); so does a value its validation rule does not allow
  // (data-validation.md "Drawing").
  const hovered = pointer.hover;
  const hoverValue = hovered ? c.workbook.value(c.sheet.id, hovered.r, hovered.c) : null;
  const hoverError =
    hovered && isError(hoverValue)
      ? displayValue(hoverValue, undefined, c.locale).error
      : hovered
        ? invalidWhy(c, hovered.r, hovered.c)
        : null;
  // A HYPERLINK under the pointer says where it goes and how to open it (formulas.md "Text").
  const hoverLink =
    hovered && !hoverError ? c.workbook.hyperlinkOf(c.sheet.id, hovered.r, hovered.c) : null;
  const hoverBox =
    hovered && (hoverError || hoverLink)
      ? cellBox(c.geometry, hovered.r, hovered.c, c.scroll)
      : null;

  // A callback ref of its own: a property of `c` passed as `ref` would make the whole controller read as a ref.
  const { setGridEl } = c;
  // The tables' chips' layer over the headers, handed to the tables layer once drawn.
  const [chipHost, setChipHost] = useState<HTMLDivElement | null>(null);
  return (
    // A frame of the grid's room, the grid in it laid out at 1 / zoom of it and scaled back up (docs/specs/029-sheets/
    // sheet.md "Zoom"): the pointer reads its scale as it reads the canvas's (screen size over layout size), so
    // selecting, dragging, panning and menus work at any zoom. Always there, so zooming never remounts the grid.
    <div data-sheet-grid-frame className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={setGridEl}
        style={
          zoom === 1
            ? undefined
            : {
                width: `${100 / zoom}%`,
                height: `${100 / zoom}%`,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
              }
        }
        // Escape first ends an edit, the copied range's marquee or Find; only then does it restore a maximised sheet.
        data-keeps-escape={c.editing || c.marquee || c.findOpen || c.rules.paint ? '' : undefined}
        role="grid"
        tabIndex={c.interactive ? 0 : -1}
        aria-label={`${c.sheet.title} grid`}
        aria-rowcount={c.sheet.layout.rows.length}
        aria-colcount={c.sheet.layout.cols.length}
        aria-multiselectable
        aria-activedescendant={mirrorCellId(elementId, c.selection.active.r, c.selection.active.c)}
        data-sheet-grid
        className={`absolute left-0 top-0 h-full w-full outline-none ${c.interactive ? (c.maximised ? 'overflow-auto' : 'overflow-auto touch-none') : 'overflow-hidden'}`}
        onScroll={(e) =>
          c.setScroll(
            sheetScrollOf(room, {
              top: e.currentTarget.scrollTop,
              left: e.currentTarget.scrollLeft,
            }),
          )
        }
        onKeyDown={onKeyDown}
        onBlur={() => pointer.pan.releaseSpace()}
        onKeyUp={(e) => {
          if (!c.editing && e.target === e.currentTarget)
            // Space on checkbox cells toggles them (data-validation.md "Using a checkbox"); else it types a space.
            pointer.pan.onKeyUp(e, () => {
              if (!actions.toggleCheckboxes()) actions.startEdit('type', ' ');
            });
        }}
        onCopy={clipboard.onCopy}
        onCut={clipboard.onCut}
        onPaste={clipboard.onPaste}
      >
        <div className="relative" style={room.spacer}>
          <div
            ref={viewportRef}
            // A held finger selects cells, so it never starts the browser's own text selection or callout.
            className="sticky left-0 top-0 overflow-hidden [-webkit-touch-callout:none] pointer-coarse:select-none"
            style={{ width: c.view.width, height: c.view.height, cursor: pointer.cursor }}
            onPointerDown={pointer.onPointerDown}
            onPointerMove={pointer.onPointerMove}
            onDoubleClick={pointer.onDoubleClick}
            onContextMenu={pointer.onContextMenu}
            onClick={pointer.onClick}
          >
            {/* Clipped, never scrolled: a focused control half out of view (a slicer's button) would scroll a hidden
              overflow box under the headers, out of step with them. */}
            <div
              className="absolute overflow-clip"
              style={{ left: c.geometry.headW, top: c.geometry.headH, right: 0, bottom: 0 }}
            >
              <SheetCells
                drawn={c.drawnPivots}
                padEnd={dropdownCols}
                filterHead={filterHead}
                formatRules={formatRules}
                sheet={c.sheet}
                workbook={c.workbook}
                version={c.version}
                font={c.font}
                geometry={c.geometry}
                window={window}
                scroll={c.scroll}
                palette={c.palette}
                locale={c.locale}
                fontFamily={fontFamily}
                showFormulas={showFormulas}
              />
              <SheetProtectionLayer />
              <TableChipsHostContext.Provider value={chipHost}>
                <SheetTablesLayer />
              </TableChipsHostContext.Provider>
              {/* A group by view's header rows (data-tools.md "Group by view"). */}
              <SheetGroupBands />
              <SheetPivotsLayer />
              {c.interactive ? (
                <SheetSelectionLayer
                  geometry={c.geometry}
                  scroll={c.scroll}
                  palette={c.palette}
                  selection={c.selection}
                  showHandle={(c.canEdit || coarse) && !c.editing && c.focused}
                  marquee={c.marquee}
                  outlines={outlines}
                  filter={filter}
                  onFilterButton={(colId, at) =>
                    c.setMenu({ kind: 'filter', colId, x: at.x, y: at.y })
                  }
                  quiet={!c.focused}
                />
              ) : null}
              <SheetCardRows />
              {/* Dropdowns, checkboxes and the rule panels (data-validation.md, conditional-formatting.md). */}
              <SheetRuleLayer actions={actions} />
              <SheetCellComments hover={pointer.hover} />
              <SheetSmartFillLayer window={window} actions={actions} />
              {/* A split's Separator chip (data-tools.md "Split Text to Columns"), a spreadsheet's. */}
              <SheetSplitChip />
              {/* A spreadsheet's images over cells, under its charts (inserted-objects.md "Images over cells"). */}
              <SheetImagesLayer />
              {/* The charts that sit in this Sheet, over its cells (sheet.md "Charts"). */}
              <SheetChartsLayer fontFamily={fontFamily} />
              {/* The slicers over this sheet (data-tools.md "Slicers"). */}
              <SheetSlicersLayer actions={actions} />
              {/* A fill's target, or where a block dragged by its border lands (grid-and-editing.md "Fill and move"). */}
              {pointer.preview?.kind === 'fill' || pointer.preview?.kind === 'block' ? (
                <SheetSelectionLayer
                  geometry={c.geometry}
                  scroll={c.scroll}
                  palette={c.palette}
                  selection={single({ r: pointer.preview.range.r1, c: pointer.preview.range.c1 })}
                  showHandle={false}
                  marquee={{ range: pointer.preview.range, cut: false, runs: pointer.preview.runs }}
                  outlines={[]}
                  filter={null}
                  onFilterButton={null}
                />
              ) : null}
              {/* The cells in view for a screen reader, the active one among them: what aria-activedescendant names. */}
              <SheetGridMirror
                drawn={c.drawnPivots}
                elementId={elementId}
                sheet={c.sheet}
                workbook={c.workbook}
                version={c.version}
                geometry={c.geometry}
                locale={c.locale}
                rows={window.rows}
                c1={window.c1}
                c2={window.c2}
                activeR={c.selection.active.r}
                activeC={c.selection.active.c}
              />
            </div>
            {/* The editor is the active cell's, so it sits in that cell's row: the grid owns only rows. */}
            <div
              role="row"
              aria-rowindex={c.selection.active.r + 1}
              className="absolute select-text"
              style={{ left: c.geometry.headW, top: c.geometry.headH }}
            >
              <div role="gridcell" aria-colindex={c.selection.active.c + 1}>
                <SheetCellEditor input={input} fontFamily={fontFamily} />
              </div>
            </div>
            {/* A finger held on the cells (useSheetTouch): the hold ring, portalled to the finger. */}
            <LongPressRing point={pointer.ring} />
            <SheetHeaders
              geometry={c.geometry}
              window={window}
              scroll={c.scroll}
              palette={headerPalette}
              selection={c.interactive ? c.selection : null}
              view={c.view}
              onUnhide={
                (c.canShape ?? c.canEdit)
                  ? (axis, from, to) => actions.hide(axis, false, from, to)
                  : null
              }
            />
            <SheetOutlineBar onFold={c.interactive ? actions.fold : null} />
            {/* The tables' chips, over the cells and the column letters alike (data-tools.md "Tables", D503). */}
            <div
              ref={setChipHost}
              data-table-chips=""
              className="pointer-events-none absolute inset-0"
            />
            {pointer.preview?.kind === 'resize' || pointer.preview?.kind === 'move' ? (
              <div
                className="pointer-events-none absolute z-[9]"
                style={
                  pointer.preview.axis === 'c'
                    ? {
                        left:
                          pointer.preview.kind === 'move'
                            ? c.geometry.headW + pointer.preview.at
                            : pointer.preview.at,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        backgroundColor: c.palette.focus,
                      }
                    : {
                        top:
                          pointer.preview.kind === 'move'
                            ? c.geometry.headH + pointer.preview.at
                            : pointer.preview.at,
                        left: 0,
                        right: 0,
                        height: 2,
                        backgroundColor: c.palette.focus,
                      }
                }
              />
            ) : null}
            {footer && total.height - c.scroll.top < c.view.height ? (
              <SheetCellSlot>
                <SheetAddRows top={total.height - c.scroll.top} onAdd={actions.appendRows} />
              </SheetCellSlot>
            ) : null}
            <SheetTouchLinkChip tapped={pointer.touchLink.tapped} onOpen={pointer.touchLink.open} />
            {hovered && (hoverError || hoverLink) && hoverBox ? (
              <SheetCellSlot r={hovered.r} c={hovered.c}>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute z-[10] max-w-64 rounded-control bg-slate-800 px-2 py-1 text-supporting text-white shadow"
                  style={{
                    left: c.geometry.headW + hoverBox.x,
                    top: c.geometry.headH + hoverBox.y + hoverBox.h + 2,
                  }}
                >
                  {hoverError ?? (
                    <>
                      <span className="block truncate">{hoverLink}</span>
                      <span className="block text-slate-300">{`${keyLabel('Mod-Click')} to open`}</span>
                    </>
                  )}
                </div>
              </SheetCellSlot>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
