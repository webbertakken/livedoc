'use client';

// The charts that sit in a Sheet (docs/specs/029-sheets/sheet.md "Charts"): drawn over its cells at their anchors,
// clipped to the grid, scrolling and zooming with the cells. Someone who may shape the Sheet (an Editor) selects one
// by clicking it, drags it to move it, drags its corner to resize it and removes it with Delete, Backspace or Delete
// Chart; each is one undo step (bridge.commitElements). A right-click on one, or its Chart Options button, opens the
// element menu the canvas opens for that chart (Style, Legend, Palette, the chart type, Unlink From Sheet). Anyone else
// sees them, and the pointer passes through to the cells.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CHART_TYPE_LABELS,
  chartTypeOf,
  chartsInSheet,
  type Element,
  type ShapeElement,
} from '@livedoc/document';
import { DataChartView } from '@/components/canvas/DataChartView';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';
import { useSheetCharts } from './sheet-charts-context';
import { useSheetController } from './sheet-controller';
import { SheetLinkedChart } from './SheetLinkedChart';
import { movedAnchor, resizedChart, takePlacedChart } from './sheet-charts';
import type { PlanPalette } from '@/components/plan/plan-palette';
import { openElementMenu } from '@/hooks/canvas/element-menu-opener';
import { DeleteIcon, MoreIcon } from './sheet-icons';
import {
  layerScale,
  SheetObjectButton,
  SheetObjectButtons,
  SheetObjectFrame,
  SheetObjectHandles,
  useSheetObjectDrag,
} from './SheetObjectFrame';

// A chart resizes by its bottom-right corner alone.
const CHART_HANDLES = ['se'] as const;

export function SheetChartsLayer({ fontFamily }: { fontFamily?: string | undefined }) {
  const ctx = useSheetCharts();
  const c = useSheetController();
  const bridge = useSheetsBridgeContext();
  const elements = ctx?.elements;
  const sheetId = c.sheet.id;
  const writes = ctx?.writes;
  // A spreadsheet hands its sheet's own charts over (charts.md "The model"); a Plan tab its elements, of every Sheet.
  const charts = useMemo(
    () =>
      writes
        ? ((elements ?? []) as ShapeElement[])
        : elements
          ? (chartsInSheet(elements as Element[], sheetId) as ShapeElement[])
          : [],
    [elements, sheetId, writes],
  );
  const openMenu = writes ? writes.menu : openElementMenu;
  // An Editor's, on the open tab, with the Sheet taking input (sheet.md "Charts"; share-roles.md).
  const editable = !!ctx?.editable && !!bridge && c.interactive && c.canShape === true;
  const drawn = ctx?.renderChart;
  const [selected, setSelected] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // A chart this person just inserted is selected as it arrives, ready to move: focused, which selects it.
  useEffect(() => {
    const placed = charts.find((el) => takePlacedChart(el.id));
    if (!placed || !editable) return;
    layerRef.current
      ?.querySelector<HTMLElement>(`[data-sheet-chart="${placed.id}"]`)
      ?.focus({ preventScroll: true });
  }, [charts, editable]);

  const commit = (id: string, patch: (el: ShapeElement) => Partial<ShapeElement> | null) => {
    if (writes) {
      const cur = charts.find((el) => el.id === id);
      const p = cur && patch(cur);
      if (p) writes.change(id, p);
      return;
    }
    bridge?.commitElements((els) =>
      els.map((el) => {
        if (el.id !== id || el.type !== 'shape') return el;
        const p = patch(el);
        return p ? { ...el, ...p } : el;
      }),
    );
  };
  const { drag, begin } = useSheetObjectDrag({
    editable,
    scale: () => layerScale(layerRef.current),
    select: setSelected,
    commit: ({ id, kind, dx, dy }) =>
      commit(id, (cur) =>
        kind === 'move'
          ? cur.sheetAnchor
            ? { sheetAnchor: movedAnchor(cur.sheetAnchor, dx, dy) }
            : null
          : resizedChart(cur, dx, dy),
      ),
  });
  if (charts.length === 0) return null;

  const remove = (id: string) => {
    if (writes) writes.remove(id);
    else bridge?.commitElements((els) => els.filter((el) => el.id !== id));
    setSelected(null);
    c.focusGrid();
  };

  return (
    <div
      ref={layerRef}
      data-sheet-charts
      // The layer lives inside role="grid", which may own only rows: the charts sit in one row and cell of their own.
      role="row"
      aria-label="Charts"
      className="pointer-events-none absolute inset-0 z-[6]"
      // A press on a chart is the chart's, never the cells' or the canvas's.
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-sheet-chart]')) e.stopPropagation();
      }}
    >
      <div role="gridcell" className="absolute inset-0">
        {charts.map((el) => {
          const at = el.sheetAnchor!;
          const d = drag?.id === el.id ? drag : null;
          const pos = d?.kind === 'move' ? movedAnchor(at, d.dx, d.dy) : at;
          const size = d?.kind === 'resize' ? resizedChart(el, d.dx, d.dy) : el;
          // The element itself unless it is being resized: a new object every render (a scroll frame, a canvas drag)
          // would have its chart read its range again each time.
          const shown =
            d?.kind === 'resize' ? { ...el, width: size.width, height: size.height } : el;
          const isSelected = editable && selected === el.id;
          return (
            <SheetObjectFrame
              key={el.id}
              id={el.id}
              kind="chart"
              label={writes ? writes.labelOf(el.id) : `${chartName(el)} chart`}
              editable={editable}
              selected={isSelected}
              box={{
                left: pos.x - c.scroll.left,
                top: pos.y - c.scroll.top,
                width: size.width,
                height: size.height,
              }}
              className={drawn ? '' : 'rounded-lg border'}
              style={drawn ? ringStyle(isSelected, c.palette) : cardStyle(isSelected, c.palette)}
              onPress={(e) => begin(e, el.id, 'move')}
              onSelect={() => setSelected(el.id)}
              onLeave={() => setSelected((s) => (s === el.id ? null : s))}
              onRelease={() => {
                setSelected(null);
                c.focusGrid();
              }}
              onRemove={() => remove(el.id)}
              onNudge={(dx, dy, resize) =>
                commit(el.id, (cur) =>
                  resize
                    ? resizedChart(cur, dx, dy)
                    : cur.sheetAnchor
                      ? { sheetAnchor: movedAnchor(cur.sheetAnchor, dx, dy) }
                      : null,
                )
              }
              // The canvas's element menu for this chart, at the pointer (as a right-click on the canvas opens it).
              onMenu={openMenu ? (rect) => openMenu(el.id, rect) : undefined}
              // A spreadsheet's chart opens its Chart Editor (charts.md "Working with a chart").
              onOpen={writes?.menu ? (rect) => writes.menu?.(el.id, rect) : undefined}
              controls={
                <>
                  <SheetObjectButtons>
                    {openMenu ? (
                      <SheetObjectButton
                        label={writes?.menuLabel ?? 'Chart Options'}
                        palette={c.palette}
                        menu
                        onClick={(e) => openMenu(el.id, e.currentTarget.getBoundingClientRect())}
                      >
                        <MoreIcon />
                      </SheetObjectButton>
                    ) : null}
                    <SheetObjectButton
                      label="Delete Chart"
                      palette={c.palette}
                      onClick={() => remove(el.id)}
                    >
                      <DeleteIcon />
                    </SheetObjectButton>
                  </SheetObjectButtons>
                  <SheetObjectHandles
                    handles={CHART_HANDLES}
                    palette={c.palette}
                    onPress={(e, handle) => begin(e, el.id, 'resize', handle)}
                  />
                </>
              }
            >
              {/* Drawn by the canvas's own element view when there is a canvas (sheet-chart-renderer): its style,
                shadow, animations and indicators as on the canvas. It takes no pointer; this frame does. */}
              <div
                className={`pointer-events-none absolute inset-0 ${drawn ? '' : 'overflow-hidden rounded-lg'}`}
              >
                {writes?.noData.has(el.id) ? (
                  <div
                    className="flex h-full w-full items-center justify-center rounded-lg border text-sm"
                    style={{ borderColor: c.palette.border, color: c.palette.muted }}
                  >
                    No data
                  </div>
                ) : (
                  <SheetLinkedChart element={shown}>
                    {(live) =>
                      drawn ? (
                        drawn(live, !!ctx?.editable)
                      ) : (
                        <DataChartView
                          element={live}
                          fontFamily={fontFamily}
                          textColor={c.palette.text}
                          palette={ctx?.chartPalette}
                        />
                      )
                    }
                  </SheetLinkedChart>
                )}
              </div>
            </SheetObjectFrame>
          );
        })}
      </div>
    </div>
  );
}

// A chart the canvas's view draws wears its own look; the frame adds only the selection ring, outside it.
function ringStyle(selected: boolean, palette: PlanPalette): CSSProperties {
  return selected ? { outline: `2px solid ${palette.focus}`, outlineOffset: 2 } : {};
}

// A chart drawn by its chart view alone (no canvas around the Sheet) sits on a card.
function cardStyle(selected: boolean, palette: PlanPalette): CSSProperties {
  return {
    backgroundColor: palette.surface,
    borderColor: selected ? palette.focus : palette.border,
    boxShadow: selected
      ? `0 0 0 1px ${palette.focus}, 0 4px 14px rgba(15, 23, 42, 0.14)`
      : '0 2px 8px rgba(15, 23, 42, 0.10)',
  };
}

function chartName(el: ShapeElement): string {
  return CHART_TYPE_LABELS[chartTypeOf(el) ?? 'column'];
}
