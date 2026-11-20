'use client';

// The toolbar's zoom (docs/specs/034-text-documents/editing-surface.md "Zoom"): a field with a list, as Google's. A
// typed whole number from 50 to 200 applies on Enter; anything else puts the value back. Down or the chevron opens the
// list (Fit and the presets); Up and Down move through it, Enter takes one, Escape closes it.
import { useId, useRef, useState } from 'react';
import { ChevronDownIcon, useClickOutside } from '@livedoc/ui';
import {
  parseZoomText,
  zoomLabel,
  ZOOM_PRESETS,
  type OfficeZoomValue,
} from '@/lib/office/office-zoom';

export type OfficeZoom = { value: OfficeZoomValue; onChange: (zoom: OfficeZoomValue) => void };

export function OfficeZoomField({ zoom, tabIndex }: { zoom: OfficeZoom; tabIndex: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  useClickOutside(box, () => setOpen(false), open);

  const shown = draft ?? zoomLabel(zoom.value);
  const take = (next: OfficeZoomValue) => {
    setDraft(null);
    setOpen(false);
    if (next !== zoom.value) zoom.onChange(next);
  };
  const openList = () => {
    setActive(Math.max(0, ZOOM_PRESETS.indexOf(zoom.value)));
    setOpen(true);
  };

  return (
    <div ref={box} className="relative flex h-7 items-center rounded hover:bg-(--office-hover)">
      <input
        ref={field}
        role="combobox"
        aria-label="Zoom"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        tabIndex={tabIndex}
        data-office-control="zoom"
        value={shown}
        size={4}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (open) setActive((i) => (i + 1) % ZOOM_PRESETS.length);
            else openList();
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault();
            setActive((i) => (i - 1 + ZOOM_PRESETS.length) % ZOOM_PRESETS.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) take(ZOOM_PRESETS[active]!);
            else {
              const typed = draft === null ? null : parseZoomText(draft);
              if (typed !== null) take(typed);
              else setDraft(null);
            }
          } else if (e.key === 'Escape' && (open || draft !== null)) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setDraft(null);
          }
        }}
        className="w-12 bg-transparent pl-2 text-sm text-(--office-ink) outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-(--office-focus)"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Zoom levels"
        onClick={() => (open ? setOpen(false) : openList())}
        className="flex h-7 w-5 items-center justify-center text-(--office-icon) outline-none"
      >
        <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Zoom"
          className="absolute top-full left-0 z-30 mt-1 min-w-24 rounded-md bg-(--office-menu) py-1 text-sm text-(--office-ink) shadow-lg"
        >
          {ZOOM_PRESETS.map((preset, i) => (
            <li
              key={String(preset)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={preset === zoom.value}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => take(preset)}
              className={`cursor-default px-4 py-1.5 ${i === active ? 'bg-(--office-menu-hover)' : ''}`}
            >
              {zoomLabel(preset)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
