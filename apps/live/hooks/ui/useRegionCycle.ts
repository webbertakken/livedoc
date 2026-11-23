'use client';

// F6 moves between the editor's regions (docs/specs/004-interface-design/canvas-accessibility.md "F6 moves between
// regions"): Tab is busy inside the canvas walking its elements, so the chrome after it in the tab order sat behind
// dozens of presses. F6 goes to the next region and Shift+F6 to the previous, wrapping round, in screen order; a
// region not on screen is skipped. Each region's root carries `data-region` with its name.
import { useEffect } from 'react';

/** The regions, in screen order: the canvas's, and the office shell's parts for a kind outside the canvas (menu bar,
 *  toolbar, the panels either side of the document). Only one set is on screen at a time. */
export const EDITOR_REGIONS = [
  'header',
  'menubar',
  'toolbar',
  'formulabar',
  'palette',
  'left',
  'canvas',
  'document',
  'right',
  'controls',
  'tabs',
] as const;
export type EditorRegion = (typeof EDITOR_REGIONS)[number];

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const shown = (el: HTMLElement): boolean =>
  el.getClientRects().length > 0 && !el.closest('.hidden, [hidden], [aria-hidden="true"]');

/** The roots of the regions on screen, in screen order (a region's first shown root: the Palette is the strip or
 *  the Draw dock, whichever the tab has). */
export function shownRegions(doc: Document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const name of EDITOR_REGIONS) {
    const root = [...doc.querySelectorAll<HTMLElement>(`[data-region="${name}"]`)].find(shown);
    if (root) out.push(root);
  }
  return out;
}

/** Where focus lands in a region: the root itself when it takes focus (the canvas), else its first shown control of
 *  its own (not one of a region inside it) in the tab order, so a menu bar or toolbar lands on its tab stop. */
export function regionTarget(root: HTMLElement): HTMLElement | null {
  if (root.tabIndex >= 0 && root.hasAttribute('tabindex')) return root;
  return (
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (el) => el.tabIndex >= 0 && el.closest('[data-region]') === root && shown(el),
    ) ?? null
  );
}

/** The region F6 (or Shift+F6, `back`) moves to from the focused element, wrapping round. */
export function nextRegion(
  regions: readonly HTMLElement[],
  focused: Element | null,
  back: boolean,
): HTMLElement | null {
  if (regions.length === 0) return null;
  // The innermost region holding focus: the palette strip sits inside the canvas's <main>.
  const here = focused?.closest<HTMLElement>('[data-region]') ?? null;
  const at = here ? regions.indexOf(here) : -1;
  if (at < 0) return back ? regions[regions.length - 1]! : regions[0]!;
  return regions[(at + (back ? -1 : 1) + regions.length) % regions.length]!;
}

/** The way a key moves between regions: F6 and Ctrl+Alt+. on, Shift+F6 and Ctrl+Alt+, back; null for any other key.
 *  AltGr (Ctrl+Alt on Windows) types characters, so a key composed with it never moves. */
export function regionStep(e: KeyboardEvent): 'on' | 'back' | null {
  if (e.key === 'F6' && !e.altKey && !e.ctrlKey && !e.metaKey) return e.shiftKey ? 'back' : 'on';
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey || e.getModifierState('AltGraph'))
    return null;
  return e.code === 'Period' ? 'on' : e.code === 'Comma' ? 'back' : null;
}

/** F6 and Shift+F6 (or Ctrl+Alt+. and ,) cycle focus through the regions on screen. Off inside a modal dialog. */
export function useRegionCycle(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const step = regionStep(e);
      if (!step) return;
      if (document.activeElement?.closest('[aria-modal="true"]')) return;
      const back = step === 'back';
      const regions = shownRegions(document);
      let next = nextRegion(regions, document.activeElement, back);
      // A region with nothing to focus is passed over (at most once round).
      for (let i = 0; next && i < regions.length; i++) {
        const target = regionTarget(next);
        if (target) {
          e.preventDefault();
          target.focus();
          return;
        }
        next = nextRegion(regions, next, back);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
