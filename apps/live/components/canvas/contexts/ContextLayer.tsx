'use client';

import { useMemo } from 'react';
import {
  hiddenLayerElementIds,
  nameSuggestionsFor,
  type Element,
  type ElementId,
  type Layer,
} from '@livedoc/document';
import type { ContextControls, SuggestionControls } from '@/components/canvas/Canvas.types';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { CONTEXT_INK_VARS } from '@/components/canvas/contexts/context-ink';
import { applyOverlay, useDragPreview, useLocalDragPreview } from '@/lib/drag-preview';
import { drawnContexts } from '@/lib/context-outlines';
import {
  endSuggestionPreview,
  leaveSuggestion,
  nameKey,
  parsePreviewKey,
  previewSuggestion,
  previewedContextIds,
  useSuggestionView,
} from '@/lib/suggestion-view';
import {
  clearContextSelection,
  editContextName,
  selectContext,
  selectContexts,
  setDrawingContext,
  useContextSelection,
} from '@/lib/context-selection';
import { notesInLoop } from '@/lib/context-loop';
import { ContextDrawPen } from './ContextDrawPen';
import { ContextMergeOffer } from './ContextMergeOffer';
import { ContextName } from './ContextName';
import { ContextOutline, contextNameButton, type ContextOutlineActs } from './ContextOutline';
import { NameChips, type NameChipActs } from './NameChips';
import { useClearContextSelection } from './useClearContextSelection';

// A board's candidate contexts on the canvas (docs/specs/021-event-storming/candidate-contexts.md), in canvas units
// beneath every element: each outline drawn round its notes as they are drawn now, so it follows a note in hand.
// Everyone sees the kept ones; the suggested ones, and every act, are an Editor's. So are the names an agent suggests
// for a context (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): a count beside
// its name, chips under the name of the one selected, and chips in the merge offer for several.

const NO_DRAG: ReadonlySet<string> = new Set();

export function ContextLayer({
  part,
  elements,
  tabId,
  layers,
  contexts,
  showSuggested,
  suggestions,
  shiftX,
}: {
  // The lines, drawn beneath the notes, or the names and the merge offer, drawn over them
  // (candidate-contexts.md "The name"): the layer is rendered once for each.
  part: 'lines' | 'names';
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
  const selection = useContextSelection(tabId);
  const overlay = useDragPreview(tabId, elements);
  // The notes this person has in hand; only someone who may change contexts sees where a drop would land.
  const local = useLocalDragPreview(tabId);
  const draggedIds = useMemo(
    () => (contexts && local ? new Set(local.changed.keys()) : NO_DRAG),
    [contexts, local],
  );
  const { drawn, board, hidden } = useMemo(() => {
    const shown = overlay ? applyOverlay(elements, overlay) : elements;
    const off = hiddenLayerElementIds(shown, layers);
    return {
      board: shown,
      hidden: off,
      drawn: drawnContexts({
        committed: elements,
        drawn: shown,
        hidden: off,
        shiftX,
        draggedIds,
        showSuggested,
      }),
    };
  }, [elements, overlay, layers, shiftX, draggedIds, showSuggested]);
  // Draw Context's pen, armed by an Editor (candidate-contexts.md "Making one by hand").
  const pen = part === 'names' && contexts !== undefined && selection.drawing;
  useClearContextSelection(
    tabId,
    part === 'names' &&
      (selection.ids.size > 0 || selection.editingId !== null || selection.drawing),
  );
  if (drawn.length === 0 && !pen) return null;

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
    return { kept: { onDelete: () => contexts.remove(id) } };
  };
  const selectFor = (id: string): ContextOutlineActs['select'] =>
    contexts
      ? {
          onSelect: (add) => {
            contexts.clearSelection();
            selectContext(tabId, id, add);
          },
          onRename: (name) => contexts.rename(id, name),
          onEditing: (open) => editContextName(tabId, open ? id : null),
        }
      : undefined;
  const merging = contexts ? drawn.filter((d) => selection.ids.has(d.context.id)) : [];

  // Name suggestions are read from the board as committed: a chip being previewed redraws the context under its
  // name, and must not take itself away.
  const previewedIds = previewedContextIds(view.previewKey);
  const previewed = parsePreviewKey(view.previewKey);
  const chipsFor = (ids: readonly ElementId[], merge: boolean) => {
    if (!suggestions) return null;
    const names = nameSuggestionsFor(elements, ids);
    if (names.length === 0) return null;
    const decide = (act: () => void) => {
      endSuggestionPreview(tabId);
      act();
    };
    // The chips go with what they decided: the keyboard stays on the context's name.
    const backToName = (id: ElementId) =>
      requestAnimationFrame(() => contextNameButton(id)?.focus());
    const acts: NameChipActs = {
      onChoose: (name) =>
        decide(() => {
          const kept = suggestions.chooseName(ids, name);
          if (!kept) return;
          selectContexts(tabId, [kept]);
          backToName(kept);
        }),
      onDismiss: (name) =>
        decide(() => {
          suggestions.dismissNames(ids, [name]);
          if (!merge) backToName(ids[0]!);
        }),
      onDismissAll: merge
        ? undefined
        : () =>
            decide(() => {
              suggestions.dismissNames(ids);
              backToName(ids[0]!);
            }),
      onPreview: (name) => previewSuggestion(tabId, nameKey(ids, name)),
      onLeave: (name) => leaveSuggestion(tabId, nameKey(ids, name)),
    };
    const shown =
      previewed?.type === 'name' &&
      previewed.contextIds.length === ids.length &&
      previewed.contextIds.every((id) => ids.includes(id))
        ? previewed.name
        : null;
    return <NameChips names={names} merge={merge} previewed={shown} acts={acts} />;
  };
  const mergingIds = merging.map((d) => d.context.id);

  return (
    <div
      data-testid={`context-${part}`}
      className="lvd-context pointer-events-none absolute left-0 top-0"
      style={CONTEXT_INK_VARS}
    >
      {drawn.map((d) => {
        const acts = { ...actsFor(d.context.id, d.suggested), select: selectFor(d.context.id) };
        const selected = selection.ids.has(d.context.id);
        // The one selected context: its chips and its Ask stand with its name; several share the merge offer.
        const alone = selected && selection.ids.size === 1;
        return part === 'lines' ? (
          <ContextOutline
            key={d.context.id}
            drawn={d}
            zoom={zoom}
            previewed={previewedIds.includes(d.context.id)}
            selected={selected}
            acts={acts}
          />
        ) : (
          <ContextName
            key={d.context.id}
            drawn={d}
            zoom={zoom}
            selected={selected}
            editing={selection.editingId === d.context.id}
            acts={acts}
            names={showSuggested ? nameSuggestionsFor(elements, [d.context.id]).length : 0}
            below={alone ? chipsFor([d.context.id], false) : null}
            onAsk={
              alone && suggestions
                ? () => suggestions.openAsk({ type: 'context', id: d.context.id })
                : undefined
            }
          />
        );
      })}
      {part === 'names' && contexts && merging.length >= 2 ? (
        <ContextMergeOffer
          contexts={merging}
          zoom={zoom}
          chips={chipsFor(mergingIds, true)}
          onAsk={
            suggestions
              ? () => suggestions.openAsk({ type: 'contexts', ids: mergingIds })
              : undefined
          }
          onMerge={() => {
            const kept = contexts.merge(mergingIds);
            if (kept) editContextName(tabId, kept);
          }}
          onCancel={() => clearContextSelection(tabId)}
        />
      ) : null}
      {pen ? (
        <ContextDrawPen
          zoom={zoom}
          onLoop={(loop) => {
            const made = contexts.create(notesInLoop(board, loop, hidden), 'drawn');
            if (made) editContextName(tabId, made);
            else setDrawingContext(tabId, false);
          }}
        />
      ) : null}
    </div>
  );
}
