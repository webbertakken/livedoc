'use client';

import { useMemo, type CSSProperties } from 'react';
import { CONTEXT_INK, hiddenLayerElementIds, type Element, type Layer } from '@livedoc/document';
import type { ContextControls, SuggestionControls } from '@/components/canvas/Canvas.types';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { applyOverlay, useDragPreview, useLocalDragPreview } from '@/lib/drag-preview';
import { drawnContexts } from '@/lib/context-outlines';
import {
  endSuggestionPreview,
  leaveSuggestion,
  previewSuggestion,
  useSuggestionView,
} from '@/lib/suggestion-view';
import { ContextOutline, type ContextOutlineActs } from './ContextOutline';

// A board's candidate contexts on the canvas (docs/specs/021-event-storming/candidate-contexts.md), in canvas units
// beneath every element: each outline drawn round its notes as they are drawn now, so it follows a note in hand.
// Everyone sees the kept ones; the suggested ones, and every act, are an Editor's.

// The inks as custom properties: the light pair, swapped for the dark pair on a dark canvas (globals.css).
const INK_VARS = {
  '--ctx-line-light': CONTEXT_INK.light.line,
  '--ctx-name-light': CONTEXT_INK.light.name,
  '--ctx-line-dark': CONTEXT_INK.dark.line,
  '--ctx-name-dark': CONTEXT_INK.dark.name,
} as CSSProperties;

const NO_DRAG: ReadonlySet<string> = new Set();

export function ContextLayer({
  elements,
  tabId,
  layers,
  contexts,
  showSuggested,
  suggestions,
  shiftX,
}: {
  elements: Element[];
  tabId: string;
  layers: Layer[] | undefined;
  // Suggested contexts are drawn for an Editor who sees suggestions, even while a drag puts their acts away.
  showSuggested: boolean;
  // Kept contexts' acts; absent for someone who may not change them.
  contexts: ContextControls | undefined;
  // Suggestions' acts; absent when suggestions are not shown (another role, a locked tab, a drag in hand).
  suggestions: SuggestionControls | undefined;
  shiftX: (id: string) => number | undefined;
}) {
  const zoom = useCanvasZoom();
  const view = useSuggestionView(tabId);
  const overlay = useDragPreview(tabId, elements);
  // The notes this person has in hand; only someone who may change contexts sees where a drop would land.
  const local = useLocalDragPreview(tabId);
  const draggedIds = useMemo(
    () => (contexts && local ? new Set(local.changed.keys()) : NO_DRAG),
    [contexts, local],
  );
  const drawn = useMemo(() => {
    const board = overlay ? applyOverlay(elements, overlay) : elements;
    return drawnContexts({
      committed: elements,
      drawn: board,
      hidden: hiddenLayerElementIds(board, layers),
      shiftX,
      draggedIds,
      showSuggested,
    });
  }, [elements, overlay, layers, shiftX, draggedIds, showSuggested]);
  if (drawn.length === 0) return null;

  const actsFor = (id: string, suggested: boolean): ContextOutlineActs => {
    if (suggested && suggestions) {
      const key = `c:${id}`;
      return {
        suggested: {
          onApply: () => {
            endSuggestionPreview(tabId);
            suggestions.apply(id);
          },
          onDismiss: () => {
            endSuggestionPreview(tabId);
            suggestions.dismiss(id);
          },
          onPreview: () => previewSuggestion(tabId, key),
          onLeave: () => leaveSuggestion(tabId, key),
        },
      };
    }
    if (suggested || !contexts) return {};
    return {
      kept: {
        onSelect: contexts.clearSelection,
        onRename: (name) => contexts.rename(id, name),
        onDelete: () => contexts.remove(id),
      },
    };
  };

  return (
    <div
      data-testid="context-layer"
      className="lvd-context pointer-events-none absolute left-0 top-0"
      style={INK_VARS}
    >
      {drawn.map((d) => (
        <ContextOutline
          key={d.context.id}
          drawn={d}
          zoom={zoom}
          previewed={view.previewKey === `c:${d.context.id}`}
          acts={actsFor(d.context.id, d.suggested)}
        />
      ))}
    </div>
  );
}
