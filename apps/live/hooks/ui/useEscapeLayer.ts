'use client';

import { useEffect, useEffectEvent } from 'react';
import { isInMenuSurface } from '@livedoc/ui';
import { escapeLayer, type EscapeLayer, type EscapeState } from '@/lib/escape-ladder';
import { anyModalOpen } from '@/lib/modal-guard';
import { isTypingTarget } from '@/lib/typing-target';

// A transient layer Escape backs out of wherever the keyboard stands (docs/specs/004-interface-design/escape.md):
// while it is held, an Escape pressed anywhere backs out of it, unless something further in is present (a field
// holding focus, a menu or a dialog) or the press lands in the surface that owns the layer, whose own keys take it.
// Held layers are known to every other Escape listener, so an outer one (the selection) stands aside for them.

const held = new Map<EscapeLayer, number>();

/** The layers held right now, for a listener that owns an outer one to stand aside. */
export function heldEscapeLayers(): EscapeState {
  const state: EscapeState = {};
  for (const [layer, count] of held) if (count > 0) state[layer] = true;
  return state;
}

function hold(layer: EscapeLayer): () => void {
  held.set(layer, (held.get(layer) ?? 0) + 1);
  return () => held.set(layer, Math.max(0, (held.get(layer) ?? 0) - 1));
}

/** Whether an Escape at `target` reaches `layer`: nothing further in is present where it was pressed. */
export function escapeReaches(layer: EscapeLayer, target: EventTarget | null): boolean {
  const state: EscapeState = {
    ...heldEscapeLayers(),
    field: isTypingTarget(target),
    surface: anyModalOpen() || isInMenuSurface(target),
    [layer]: true,
  };
  return escapeLayer(state) === layer;
}

/**
 * Holds `layer` while `active`; Escape pressed outside `ownedBy` (a selector for the surface whose own keys take it)
 * then calls `onEscape` and is spoken for. Listens on the document's capture phase: after a gesture's own Escape
 * (the window's capture phase, which swallows it), before the canvas's shortcuts.
 */
export function useEscapeLayer(
  layer: EscapeLayer,
  active: boolean,
  onEscape: () => void,
  ownedBy?: string,
): void {
  const backOut = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return;
    const release = hold(layer);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (ownedBy && target?.closest(ownedBy)) return;
      if (!escapeReaches(layer, e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      backOut();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      release();
    };
  }, [layer, active, ownedBy]);
}

export function resetEscapeLayersForTests(): void {
  held.clear();
}
