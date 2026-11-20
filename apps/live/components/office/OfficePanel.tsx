'use client';

// The office shell's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"): a frame with the
// panel's title and its ×, the kind's body scrolling under it; the right one resizable from its left edge. Escape inside
// closes it. Below 600 px a panel covers the pages.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '@livedoc/ui';
import {
  clampPanelWidth,
  OFFICE_LEFT_PANEL_WIDTH,
  OFFICE_PANEL_WIDTH,
  type OfficePanelSpec,
} from '@/lib/office/office-panels';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

export function OfficePanel({
  spec,
  width,
  onWidth,
  onWidthDone,
  onClose,
  focusNonce,
  children,
}: {
  spec: OfficePanelSpec;
  // The right panel's width and how it changes; the left panel has a fixed width.
  width?: number;
  onWidth?: (width: number) => void;
  // A resize finished (a key, or the edge let go): the width is kept.
  onWidthDone?: () => void;
  onClose: () => void;
  // Changes when the panel is opened by a person (a menu item or a shortcut): focus moves into it.
  focusNonce: number;
  children: ReactNode;
}) {
  const titleId = useId();
  const body = useRef<HTMLDivElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);
  const resizable = spec.side === 'right' && width !== undefined && onWidth !== undefined;

  useEffect(() => {
    if (focusNonce === 0) return;
    (body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? close.current)?.focus();
  }, [focusNonce]);

  return (
    <aside
      aria-labelledby={titleId}
      data-region={spec.side}
      style={{ width: resizable ? width : OFFICE_LEFT_PANEL_WIDTH }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      className={`relative flex shrink-0 flex-col bg-(--office-chrome) text-(--office-ink) phone:absolute phone:inset-0 phone:z-20 phone:w-full! ${
        spec.side === 'left' ? 'border-r' : 'border-l'
      } border-(--office-line)`}
    >
      {resizable ? (
        <OfficePanelEdge
          title={spec.title}
          width={width}
          onWidth={onWidth}
          onDone={onWidthDone ?? (() => {})}
        />
      ) : null}
      <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-medium">
          {spec.title}
        </h2>
        <button
          ref={close}
          type="button"
          aria-label={`Close ${spec.title}`}
          onClick={onClose}
          className="touch-target relative flex size-8 shrink-0 items-center justify-center rounded-full text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {children}
      </div>
    </aside>
  );
}

// The right panel's left edge: a vertical separator holding the width as its value. Dragging left widens it.
function OfficePanelEdge({
  title,
  width,
  onWidth,
  onDone,
}: {
  title: string;
  width: number;
  onWidth: (width: number) => void;
  onDone: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const keyed: Record<string, number> = {
    ArrowLeft: width + OFFICE_PANEL_WIDTH.step,
    ArrowRight: width - OFFICE_PANEL_WIDTH.step,
    Home: OFFICE_PANEL_WIDTH.min,
    End: OFFICE_PANEL_WIDTH.max,
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${title}`}
      aria-valuenow={width}
      aria-valuemin={OFFICE_PANEL_WIDTH.min}
      aria-valuemax={OFFICE_PANEL_WIDTH.max}
      tabIndex={0}
      onKeyDown={(e) => {
        const next = keyed[e.key];
        if (next === undefined) return;
        e.preventDefault();
        onWidth(clampPanelWidth(next));
        onDone();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        const from = drag.current;
        if (from) onWidth(clampPanelWidth(from.width + from.x - e.clientX));
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        onDone();
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none hover:bg-(--office-focus)/30 focus-visible:bg-(--office-focus) phone:hidden"
    />
  );
}

// The pages between the panels: the left panel, the kind's pages, the right panel.
export function OfficePanelLayout({
  left,
  right,
  children,
}: {
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1">
      {left}
      {children}
      {right}
    </div>
  );
}
