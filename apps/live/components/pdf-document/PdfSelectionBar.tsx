'use client';

// The small bar over a selection a finger made (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"):
// Copy, Highlight and Comment, each only where it can act now; above the selection, below it where the pages' top
// would cut it, following it as the pages scroll or zoom. Its buttons run the same bindings as the menus.
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@livedoc/ui';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { HIGHLIGHT_SELECTION } from '@/lib/pdf-document/pdf-context-menu';
import { COPY, INSERT_COMMENT } from '@/lib/pdf-document/pdf-menus';
import type { PdfViewStore } from '@/lib/pdf-document/usePdfView';
import type { PdfTextSelected } from '@/lib/pdf-document/usePdfTextSelection';

/** The bar's buttons, in order, with their words. */
const BUTTONS: readonly (readonly [id: string, label: string])[] = [
  [COPY, 'Copy'],
  [HIGHLIGHT_SELECTION, 'Highlight'],
  [INSERT_COMMENT, 'Comment'],
];

// How far the bar keeps from the selection, in CSS pixels; below it, past the handles' 44 px too.
const GAP_PX = 8;
const HANDLE_PX = 44;

type Place = { left: number; top: number };

// Where the bar goes in the pages' box: centred over the selection drawn, below it where the top would cut it.
function placeOf(pages: HTMLElement, bar: HTMLElement): Place | null {
  const host = pages.parentElement!.getBoundingClientRect();
  const drawn = [...pages.querySelectorAll('[data-pdf-text-selection] polygon')].map((polygon) =>
    polygon.getBoundingClientRect(),
  );
  if (drawn.length === 0) return null;
  const top = Math.min(...drawn.map((rect) => rect.top)) - host.top;
  const bottom = Math.max(...drawn.map((rect) => rect.bottom)) - host.top;
  const left = Math.min(...drawn.map((rect) => rect.left)) - host.left;
  const right = Math.max(...drawn.map((rect) => rect.right)) - host.left;
  const above = top - GAP_PX - bar.offsetHeight;
  const middle = (left + right) / 2 - bar.offsetWidth / 2;
  return {
    left: Math.min(
      Math.max(middle, GAP_PX),
      Math.max(GAP_PX, host.width - bar.offsetWidth - GAP_PX),
    ),
    top: above >= GAP_PX ? above : bottom + HANDLE_PX + GAP_PX,
  };
}

export function PdfSelectionBar({
  selected,
  actions,
  pages,
  view,
}: {
  selected: PdfTextSelected | null;
  actions: OfficeActions;
  // The pages' scroller: the selection is read from what it draws.
  pages: HTMLElement | null;
  // Told on every scroll and layout of the pages.
  view: PdfViewStore;
}) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const shown = selected?.touch === true;

  useEffect(() => {
    if (!shown || !pages) return;
    let frame = 0;
    // Read once the pages have drawn what changed.
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (bar.current) setPlace(placeOf(pages, bar.current));
      });
    };
    measure();
    const stop = view.subscribe(measure);
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [shown, pages, view, selected]);

  const buttons = BUTTONS.flatMap(([id, label]) => {
    const action = actions[id];
    // The tooltip says why a dimmed one is dimmed (Copy's, where the file asks not to be copied).
    return action ? [{ id, label, tip: action.label ?? label, action }] : [];
  });
  if (!shown || buttons.length === 0) return null;
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Selection"
      className={`absolute z-20 flex items-center gap-0.5 rounded-full bg-(--office-menu) px-1 text-sm text-(--office-ink) shadow-lg outline outline-1 outline-(--office-line) ${
        place ? '' : 'invisible'
      }`}
      style={place ?? { left: 0, top: 0 }}
    >
      {buttons.map(({ id, label, tip, action }) => (
        <Tooltip key={id} label={tip}>
          <button
            type="button"
            data-pdf-selection-action={id}
            aria-disabled={action.disabled || undefined}
            onClick={() => {
              if (!action.disabled) action.run();
            }}
            className="h-11 rounded-full px-3 font-medium outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
          >
            {label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
