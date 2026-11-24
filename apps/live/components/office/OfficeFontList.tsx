'use client';

// The Fonts dialog's list (docs/specs/004-interface-design/fonts.md "More fonts"): a listbox of many choices, one row
// per family, its name drawn in its face and checked while it is in My fonts. Only the rows in view are drawn, each
// telling its place in the whole list; the rows in view ask for their previews once the scroll rests.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { CheckIcon } from '@livedoc/ui';
import { MyFonts } from '@/lib/office/office-my-fonts';
import { rowFace, type MoreFontsFamily } from '@/lib/office/office-more-fonts';

export const FONT_ROW_PX = 36;
// The list's height until it is measured: the room the dialog gives it, less its search row.
export const FONT_LIST_PX = 360;
// Rows drawn past each end of the view, so a fast scroll never shows a gap.
const OVERSCAN = 5;
// How long the scroll rests before the rows in view ask for their previews.
export const PREVIEW_REST_MS = 150;

export function OfficeFontList({
  rows,
  chosen,
  onToggle,
  onPreview,
}: {
  rows: readonly MoreFontsFamily[];
  // My fonts as it stands in the dialog.
  chosen: readonly string[];
  onToggle: (name: string) => void;
  onPreview: (rows: readonly MoreFontsFamily[]) => void;
}) {
  const idBase = useId();
  const box = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  // The list's height as drawn: fixed on a wide screen, the room left on a phone.
  const [viewPx, setViewPx] = useState(FONT_LIST_PX);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewPx(element.clientHeight || FONT_LIST_PX));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / FONT_ROW_PX) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewPx) / FONT_ROW_PX) + OVERSCAN);
  const inView = useMemo(() => rows.slice(first, last), [rows, first, last]);
  const page = Math.max(1, Math.floor(viewPx / FONT_ROW_PX));

  useEffect(() => {
    if (inView.length === 0) return;
    const timer = setTimeout(() => onPreview(inView), PREVIEW_REST_MS);
    return () => clearTimeout(timer);
  }, [inView, onPreview]);

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setActive(next);
    const element = box.current!;
    const top = next * FONT_ROW_PX;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + FONT_ROW_PX > element.scrollTop + viewPx)
      element.scrollTop = top + FONT_ROW_PX - viewPx;
    setScrollTop(element.scrollTop);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      PageDown: active + page,
      PageUp: active - page,
      Home: 0,
      End: rows.length - 1,
    };
    const to = moves[e.key];
    if (to !== undefined) {
      e.preventDefault();
      moveTo(to);
      return;
    }
    const row = rows[active];
    if ((e.key === ' ' || e.key === 'Enter') && row) {
      // Enter chooses the row, never the dialog's OK.
      e.preventDefault();
      onToggle(row.name);
    }
  };

  const optionId = (index: number) => `${idBase}-${index}`;
  return (
    <div
      ref={box}
      role="listbox"
      aria-label="Fonts"
      aria-multiselectable="true"
      aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="relative min-h-0 flex-1 overflow-y-auto rounded-control border border-(--office-line) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
    >
      <div style={{ height: rows.length * FONT_ROW_PX }} className="relative">
        {inView.map((family, i) => {
          const index = first + i;
          const on = MyFonts.has(chosen, family.name);
          return (
            <div
              key={family.name}
              id={optionId(index)}
              role="option"
              aria-selected={on}
              aria-setsize={rows.length}
              aria-posinset={index + 1}
              data-active={index === active || undefined}
              onClick={() => {
                setActive(index);
                onToggle(family.name);
              }}
              style={{ top: index * FONT_ROW_PX, height: FONT_ROW_PX }}
              className={`absolute inset-x-0 flex cursor-pointer items-center gap-3 px-3 text-panel-title hover:bg-(--office-menu-hover) ${
                index === active && focused
                  ? 'bg-(--office-menu-hover) ring-2 ring-(--office-focus) ring-inset'
                  : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center text-(--office-focus)"
              >
                {on ? <CheckIcon size={18} /> : null}
              </span>
              <span className="min-w-0 truncate" style={{ fontFamily: rowFace(family.name) }}>
                {family.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
