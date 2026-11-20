'use client';

// Opening the office shell's context menu (docs/specs/004-interface-design/office-shell.md "Context menus"): a
// right-click in the document opens it at the pointer, moving the caret there first when outside the selection; with
// Shift held the browser's own menu shows; the menu key's (no pointer) and the registry's keys open it at the caret.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { visibleMenus, type OfficeActions, type OfficeEntry } from '@/lib/office/office-catalogue';
import type { Point } from '@/lib/office/context-menu-place';
import { track } from '@/lib/telemetry';
import type { OfficeContextMenuSource } from './OfficeContextMenu';

export type OfficeContextMenuState = {
  // What the session sees of the menu; empty: there is no context menu, the browser's own shows.
  entries: readonly OfficeEntry[];
  at: Point | null;
  // Opens it at the caret (the registry's keys); null while there is no menu.
  openAtCaret: (() => void) | null;
  close: () => void;
};

export function useOfficeContextMenu({
  scope,
  source,
  level,
  actions,
  telemetryKind,
  onOpen,
}: {
  scope: RefObject<HTMLElement | null>;
  source: OfficeContextMenuSource | null;
  level: AccessLevel;
  actions: OfficeActions;
  telemetryKind?: 'TextDocument';
  // A context menu opening closes any menu of the menu bar.
  onOpen: () => void;
}): OfficeContextMenuState {
  const [at, setAt] = useState<Point | null>(null);
  // Where focus was as it opened (the writing), and goes back to as it closes.
  const returnTo = useRef<HTMLElement | null>(null);
  const entries = useMemo(
    () =>
      source
        ? (visibleMenus(
            [{ id: 'context', label: 'Context menu', entries: [...source.entries] }],
            level,
            actions,
          )[0]?.entries ?? [])
        : [],
    [source, level, actions],
  );
  const open = useCallback(
    (point: Point) => {
      if (telemetryKind) track('UI', 'Opened', `${telemetryKind}ContextMenu`);
      onOpen();
      // A menu never takes focus from a text being edited (useMenu); this one is asked for, so the writing lets it go.
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement ? active : null;
      returnTo.current?.blur();
      setAt(point);
    },
    [telemetryKind, onOpen],
  );

  const latest = useRef(source);
  useEffect(() => {
    latest.current = source;
  });
  const shown = entries.length > 0;
  useEffect(() => {
    const root = scope.current;
    if (!root || !shown) return;
    const onContextMenu = (e: MouseEvent) => {
      const current = latest.current;
      const target = e.target instanceof Element ? e.target : null;
      if (!current || e.shiftKey || !target?.closest('[data-region="document"]')) return;
      e.preventDefault();
      const pointer = e.clientX !== 0 || e.clientY !== 0;
      if (pointer) current.placeCaret({ x: e.clientX, y: e.clientY });
      const point = pointer ? { x: e.clientX, y: e.clientY } : current.caretPoint();
      if (point) open(point);
    };
    // The right button's press never reaches the editor: it would take focus back from the menu as it opens, and move
    // the selection the menu is about to act on. Where the caret goes is the menu's to say.
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (e.button === 2 && !e.shiftKey && target?.closest('[data-region="document"]'))
        e.preventDefault();
    };
    root.addEventListener('mousedown', onMouseDown, true);
    root.addEventListener('contextmenu', onContextMenu);
    return () => {
      root.removeEventListener('mousedown', onMouseDown, true);
      root.removeEventListener('contextmenu', onContextMenu);
    };
  }, [scope, shown, open]);

  const openAtCaret = useMemo(
    () =>
      source && shown
        ? () => {
            const point = source.caretPoint();
            if (point) open(point);
          }
        : null,
    [source, shown, open],
  );
  const close = useCallback(() => {
    setAt(null);
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);
  return { entries, at, openAtCaret, close };
}
