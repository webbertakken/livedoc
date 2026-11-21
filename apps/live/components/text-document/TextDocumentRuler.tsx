'use client';

// The ruler (docs/specs/034-text-documents/editing-surface.md "The ruler"): across the page at its zoom, its margins
// grey, the indents and tab stops of the paragraph at the selection's start drawn as markers an Editor drags (or moves
// with the arrow keys), a press opening the add-a-tab-stop menu. While a marker moves, a guide runs down the page and a
// tooltip reads its value. Every change is one undo step and gives the writing the keyboard back. In a section of
// columns the gaps are grey and the indents and stops are the caret's column's, measured from its start.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { EditorView } from 'prosemirror-view';
import type { Command } from 'prosemirror-state';
import type { PageSetup, TabAlign, TabStop } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions, OfficeItem } from '@/lib/office/office-catalogue';
import { indentUnit, ptOf } from '@/lib/text-document/indent-units';
import { lengthText, RULER_STEP_PT, rulerMarks, snapPt } from '@/lib/text-document/ruler-scale';
import type { TextFormatting } from '@/lib/text-document/text-document-formatting';
import { setMargin } from '@/lib/text-document/text-document-page';
import { columnAt, rulerFrame, type RulerFrame } from '@/lib/text-document/ruler-frame';
import {
  markerClass,
  markerKey,
  markerName,
  placeOf,
  sameMarker,
  sliderName,
  valueOf,
  type Marker,
} from '@/lib/text-document/ruler-markers';
import {
  addTabStop,
  moveTabStop,
  REMOVE_DISTANCE_PX,
  removeTabStop,
  rulerReading,
  setRulerIndent,
} from '@/lib/text-document/text-document-ruler';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { OfficeMenuPanel } from '@/components/office/OfficeMenuPanel';

const PX_PER_PT = 4 / 3;
const RULER_HEIGHT_PX = 24;

type Drag = { marker: Marker; at: number; away: boolean; pointer: number };

const ADD_ITEMS: readonly { id: string; label: string; align: TabAlign }[] = [
  { id: 'add-left-tab-stop', label: 'Add left tab stop', align: 'start' },
  { id: 'add-centre-tab-stop', label: 'Add centre tab stop', align: 'center' },
  { id: 'add-right-tab-stop', label: 'Add right tab stop', align: 'end' },
];
const ADD_ENTRIES: readonly OfficeItem[] = ADD_ITEMS.map(({ id, label }) => ({
  kind: 'item',
  id,
  label,
  level: 'edit',
  status: 'built',
}));

// The caret's column, from where its line is drawn against the strip; the first when there is one or it cannot be read.
function caretColumnOf(view: EditorView | null, strip: HTMLElement | null, frame: RulerFrame) {
  if (!view || view.isDestroyed || !strip || frame.spans.length < 2) return 0;
  const box = strip.getBoundingClientRect();
  if (box.width <= 0) return 0;
  try {
    const { left } = view.coordsAtPos(view.state.selection.from);
    return columnAt(frame.spans, ((left - box.left) / box.width) * frame.width);
  } catch {
    return 0;
  }
}

export type TextDocumentRulerProps = {
  view: EditorView | null;
  readFormatting: () => TextFormatting | null;
  setup: PageSetup;
  // Pageless (page-layout.md "Pageless"): the ruler spans the column, with no margins to drag.
  pageless?: boolean;
  onSetup: (setup: PageSetup) => void;
  scale: number;
  canEdit: boolean;
  // Tells the ruler the caret or the writing changed.
  refresh: (listener: () => void) => () => void;
  // The visible height below the ruler, for the guide.
  guideHeight: () => number;
};

export function TextDocumentRuler({
  view,
  readFormatting,
  setup,
  pageless = false,
  onSetup,
  scale,
  canEdit,
  refresh,
  guideHeight,
}: TextDocumentRulerProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; at: number } | null>(null);
  const unit = useMemo(() => indentUnit(), []);
  const version = useSyncExternalStore(
    refresh,
    () => view?.state ?? null,
    () => null,
  );
  const formatting = readFormatting();
  const reading = useMemo(
    () =>
      version && formatting
        ? rulerReading(version, formatting)
        : { indentStart: 0, indentFirst: 0, indentEnd: 0, stops: [] as readonly TabStop[] },
    [version, formatting],
  );
  const [column, setColumn] = useState(0);
  const frame = useMemo(() => rulerFrame(setup, pageless, column), [setup, pageless, column]);
  // Read after the writing is drawn, as the caret moves or the writing changes.
  useLayoutEffect(() => {
    setColumn(caretColumnOf(view, strip.current, frame));
  }, [view, version, frame, scale]);
  const { width, margins, origin, end } = frame;
  const marks = useMemo(() => rulerMarks(width, origin, unit), [width, origin, unit]);
  const place = useCallback((marker: Marker) => placeOf(marker, frame, reading), [frame, reading]);

  const ptAt = useCallback(
    (clientX: number): number => {
      const box = strip.current!.getBoundingClientRect();
      return ((clientX - box.left) / box.width) * width;
    },
    [width],
  );

  const run = useCallback(
    (command: Command) => {
      if (!view || view.isDestroyed) return;
      // One undo step of its own, never merged with typing just before or after.
      startUndoStep(view);
      command(view.state, view.dispatch, view);
      startUndoStep(view);
      view.focus();
    },
    [view],
  );

  // A marker set at `at` (points from the page's left edge); `away` takes a tab stop away.
  const commit = useCallback(
    (marker: Marker, at: number, away = false) => {
      const f = readFormatting();
      debugLog('[text-document] ruler', {
        marker: markerName(marker),
        column: frame.column,
        from: place(marker),
        to: at,
      });
      if (marker.kind === 'margin') {
        track('Tab', 'Changed', 'TextDocumentMargins');
        onSetup(setMargin(setup, marker.side, marker.side === 'left' ? at : width - at));
        view?.focus();
        return;
      }
      if (!f) return;
      if (marker.kind === 'indent') {
        track('Element', 'Changed', 'TextDocumentRulerIndent');
        run(setRulerIndent(f, marker.marker, at - origin, end - origin));
        return;
      }
      track('Element', 'Changed', 'TextDocumentTabStop');
      run(
        away
          ? removeTabStop(f, marker.stop.position)
          : moveTabStop(f, marker.stop.position, at - origin),
      );
    },
    [readFormatting, place, frame.column, onSetup, setup, width, run, origin, end, view],
  );

  const startDrag = (marker: Marker) => (event: PointerEvent<HTMLElement>) => {
    if (!canEdit || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ marker, at: place(marker), away: false, pointer: event.pointerId });
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const box = strip.current!.getBoundingClientRect();
    const raw = ptAt(event.clientX);
    const at = event.altKey ? raw : snapPt(raw - origin, unit) + origin;
    const away =
      drag.marker.kind === 'stop' &&
      (event.clientY < box.top - REMOVE_DISTANCE_PX ||
        event.clientY > box.bottom + REMOVE_DISTANCE_PX);
    setDrag({ ...drag, at: Math.min(Math.max(at, 0), width), away });
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    setDrag(null);
    if (drag.at !== place(drag.marker) || drag.away) commit(drag.marker, drag.at, drag.away);
  };

  // Escape puts a dragged marker back.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const sliderKeys = (marker: Marker) => (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? ptOf(1, unit) : RULER_STEP_PT[unit];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      commit(marker, place(marker) + (event.key === 'ArrowLeft' ? -step : step));
    } else if (marker.kind === 'stop' && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      commit(marker, place(marker), true);
    }
  };

  // A press on the strip, away from a marker: the add menu at that point.
  const openMenuAt = (clientX: number, clientY: number, at: number) =>
    setMenu({ x: clientX, y: clientY, at: snapPt(at - origin, unit) });

  const stripKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' '))
      return;
    event.preventDefault();
    const last = reading.stops.at(-1)?.position ?? 0;
    const at = origin + snapPt(last, unit) + RULER_STEP_PT[unit];
    const box = strip.current!.getBoundingClientRect();
    setMenu({ x: box.left + (at / width) * box.width, y: box.bottom, at: at - origin });
  };

  const menuActions = useMemo((): OfficeActions => {
    const out: Record<string, OfficeActions[string]> = {};
    for (const { id, align } of ADD_ITEMS)
      out[id] = {
        run: () => {
          const f = readFormatting();
          if (!menu || !f) return;
          track('Element', 'Changed', 'TextDocumentTabStop');
          debugLog('[text-document] ruler', { marker: 'Tab stop', added: menu.at, align });
          run(addTabStop(f, align, menu.at));
        },
      };
    return out;
  }, [menu, readFormatting, run]);

  const markers: Marker[] = [
    ...(pageless
      ? []
      : [{ kind: 'margin', side: 'left' } as const, { kind: 'margin', side: 'right' } as const]),
    { kind: 'indent', marker: 'first' },
    { kind: 'indent', marker: 'left' },
    { kind: 'indent', marker: 'right' },
    ...reading.stops.map((stop): Marker => ({ kind: 'stop', stop })),
  ];
  const left = (pt: number) => `${(pt / width) * 100}%`;
  const shown = (marker: Marker) =>
    drag && sameMarker(drag.marker, marker) ? drag.at : place(marker);

  return (
    <div
      className="text-document-ruler sticky top-0 z-10 mx-auto max-sm:hidden"
      style={{ zoom: scale, width: `${width * PX_PER_PT}px`, height: RULER_HEIGHT_PX }}
      data-text-document-ruler=""
      // Its own part of the page, so F6 lands in the writing rather than on the ruler (Tab reaches it).
      data-region="ruler"
    >
      <div
        ref={strip}
        role="group"
        aria-label={canEdit ? 'Ruler. Enter adds a tab stop' : 'Ruler'}
        tabIndex={canEdit ? 0 : undefined}
        className="text-document-ruler-strip relative h-full select-none"
        onKeyDown={canEdit ? stripKeys : undefined}
        onPointerDown={(event) => {
          if (!canEdit || event.button !== 0 || event.target !== event.currentTarget) return;
          event.preventDefault();
          openMenuAt(event.clientX, event.clientY, ptAt(event.clientX));
        }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <div
          className="text-document-ruler-margin pointer-events-none absolute inset-y-0 left-0"
          style={{ width: left(margins.left) }}
        />
        <div
          className="text-document-ruler-margin pointer-events-none absolute inset-y-0 right-0"
          style={{ width: left(margins.right) }}
        />
        {frame.spans.slice(1).map((span, c) => (
          <div
            key={span.start}
            data-ruler-gap=""
            className="text-document-ruler-margin pointer-events-none absolute inset-y-0"
            style={{
              left: left(frame.spans[c]!.end),
              width: left(span.start - frame.spans[c]!.end),
            }}
          />
        ))}
        {marks.map((mark) => (
          <span
            key={mark.at}
            aria-hidden="true"
            className={`text-document-ruler-mark pointer-events-none absolute bottom-0 ${mark.kind}`}
            style={{ left: left(mark.at) }}
          >
            {mark.label}
          </span>
        ))}
        {markers.map((marker) => {
          const at = shown(marker);
          const name = sliderName(marker);
          const value = valueOf(marker, at, frame);
          const dragging = drag !== null && sameMarker(drag.marker, marker);
          return (
            <span
              key={markerKey(marker)}
              role="slider"
              aria-label={name}
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={Math.round(width)}
              aria-valuenow={Math.round(value)}
              aria-valuetext={lengthText(value, unit)}
              aria-disabled={canEdit ? undefined : true}
              tabIndex={canEdit ? 0 : undefined}
              data-marker={markerKey(marker)}
              className={`text-document-ruler-marker absolute ${markerClass(marker)}${dragging && drag.away ? ' away' : ''}`}
              style={{ left: left(at) }}
              onPointerDown={startDrag(marker)}
              onKeyDown={canEdit ? sliderKeys(marker) : undefined}
            />
          );
        })}
        {drag ? (
          <>
            <span
              aria-hidden="true"
              className="text-document-ruler-guide pointer-events-none absolute top-full"
              style={{ left: left(drag.at), height: guideHeight() / scale }}
            />
            <span
              role="status"
              className="text-document-ruler-tip pointer-events-none absolute"
              style={{ left: left(drag.at) }}
            >
              {drag.away
                ? 'Remove tab stop'
                : `${markerName(drag.marker)}: ${lengthText(valueOf(drag.marker, drag.at, frame), unit)}`}
            </span>
          </>
        ) : null}
      </div>
      {menu ? (
        <OfficeMenuPanel
          entries={ADD_ENTRIES}
          actions={menuActions}
          shortcutOf={() => null}
          trigger={null}
          initialFocus="first"
          placement="point"
          at={{ x: menu.x, y: menu.y }}
          label="Add tab stop"
          onClose={() => {
            setMenu(null);
            strip.current?.focus();
          }}
          onDone={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
