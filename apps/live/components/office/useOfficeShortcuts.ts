'use client';

// The shortcut layer (docs/specs/004-interface-design/office-shell.md "Shortcut layer"): key presses inside the
// surface, matched against the kind's registry for this platform, run what they are bound to and keep the key from
// the browser and the editor. Keys of rows nothing runs (not built, not bound, above the session's level) pass on.
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { createShortcutMatcher, type ShortcutKeys } from '@/lib/office/shortcut-matcher';
import { debugLog } from '@/lib/debug-log';

export type ShortcutRun = (arg?: string) => void;

export function useOfficeShortcuts({
  scope,
  rows,
  runs,
}: {
  // The element whose keys the layer hears (the surface's root).
  scope: RefObject<HTMLElement | null>;
  rows: readonly { id: string; keys: ShortcutKeys }[];
  // What runs each registry row now; a row missing here passes its keys on.
  runs: Readonly<Record<string, ShortcutRun | undefined>>;
}) {
  const latest = useRef(runs);
  useLayoutEffect(() => {
    latest.current = runs;
  });
  const bound = Object.keys(runs)
    .filter((id) => runs[id])
    .sort()
    .join(' ');
  const matcher = useMemo(() => {
    const ids = new Set(bound.split(' '));
    return createShortcutMatcher(
      rows.filter((row) => ids.has(row.id)),
      currentOfficePlatform(),
    );
  }, [rows, bound]);

  useEffect(() => {
    const element = scope.current;
    if (!element) return;
    const run = (e: KeyboardEvent, id: string, arg: string | undefined) => {
      const action = latest.current[id];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      debugLog('[office] shortcut', { id });
      action(arg);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const match = matcher.keydown(e);
      if (match === 'pending') {
        e.preventDefault();
        e.stopPropagation();
      } else if (match) run(e, match.id, match.arg);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const match = matcher.keyup(e);
      if (match) run(e, match.id, match.arg);
    };
    element.addEventListener('keydown', onKeyDown, true);
    element.addEventListener('keyup', onKeyUp, true);
    return () => {
      matcher.reset();
      element.removeEventListener('keydown', onKeyDown, true);
      element.removeEventListener('keyup', onKeyUp, true);
    };
  }, [scope, matcher]);
}
