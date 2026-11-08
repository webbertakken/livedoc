import { useEffect, useRef } from 'react';
import { loneMindRoot, type Element } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';

// Landing on a brainstorm about to start (docs/specs/009-elements/mind-node.md "A lone root opens selected"): a tab
// whose only element is a mind node selects it, so the first key typed names it and Tab grows its first branch. Once
// per landing (the document opening on the tab, or a switch to it), when the tab's content has loaded; only for a
// session that may write the node's label, and never over a selection already made. Selection is local: nothing is
// edited or sent.
export function useLoneRootLanding({
  hydrated,
  activeId,
  tabLoaded,
  elements,
  mayWrite,
  select,
}: {
  hydrated: boolean;
  activeId: string | null;
  // The active tab's content is authoritative (useTabEntryEffects' `tabLoaded`).
  tabLoaded: boolean;
  elements: readonly Element[];
  // The session's `can.writeText`.
  mayWrite: (el: Element) => boolean;
  select: (update: (current: string | null) => string | null) => void;
}): void {
  const landedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !activeId || !tabLoaded || landedRef.current === activeId) return;
    landedRef.current = activeId;
    const root = loneMindRoot(elements);
    if (!root || !mayWrite(root)) return;
    debugLog(`[mind] lone-root selected id=${root.id}`);
    select((current) => current ?? root.id);
    // Read once, on the landing it claims; later edits to the tab never re-run it.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [hydrated, activeId, tabLoaded]);
}
