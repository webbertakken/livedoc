'use client';

import { useMemo } from 'react';
import type { Element, ElementId, Layer, Rect } from '@livedoc/document';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import type { OfferedPreview } from '@/lib/change-preview';
import { changeMarks } from '@/lib/suggested-changes';
import {
  suggestionHints,
  suggestionSpots,
  suggestionsInTimeline,
  type SuggestionElement,
} from '@/lib/suggestion-hints';
import { panelRowBounds, panelRowKey, panelRows, type PanelRow } from '@/lib/suggestion-rows';
import {
  endSuggestionPreview,
  leaveSuggestion,
  previewSuggestion,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
  useSuggestionView,
} from '@/lib/suggestion-view';
import { track } from '@/lib/telemetry';
import { NoteChangeMarks } from './NoteChangeMarks';
import { SuggestionPeekTab } from './SuggestionPeekTab';
import { SuggestionPlaceholder } from './SuggestionPlaceholder';
import { SuggestionsPanel, type ChosenRow, type DecidedRow } from './SuggestionsPanel';

// A board's suggestions on the canvas (docs/specs/021-event-storming/suggestions.md "How a person sees them"), in
// canvas units inside the grips layer, above every element: with Show All off a peek tab per anchor side and the
// previewed suggestion's placeholder; with it on, every placeholder where Apply All would land it (the notes that
// stand aside are drawn shifted by the element list, from the same preview). The panel is portalled to the screen.
// The changes suggested to notes already there wear their marks here too
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"); a context's suggested names
// are drawn with the contexts, and listed in the panel. While a whole board is offered (a lane plan pointed at,
// docs/specs/021-event-storming/lane-plans.md), the tabs, placeholders and marks stand down: they are drawn from the
// board as written, and the notes they belong to are drawn elsewhere.

const NO_INERT: ReadonlySet<ElementId> = new Set();

export function SuggestionLayer({
  elements,
  tabId,
  controls,
  showAllSpots,
  inertIds = NO_INERT,
  layers,
  offered = null,
  onSelectContexts,
}: {
  elements: Element[];
  tabId: string;
  controls: SuggestionControls;
  // Where Apply All would land each suggestion: the Show All preview, computed beside the shift it goes with.
  showAllSpots: ReadonlyMap<string, Rect> | null;
  // Elements on hidden or locked layers: a note there wears no change mark.
  inertIds?: ReadonlySet<ElementId>;
  // The tab's layers: a lane plan leaves a note on a locked layer where it is.
  layers?: Layer[];
  // What the previewed change would make of the board, computed beside the shift it goes with.
  offered?: OfferedPreview | null;
  // Select these contexts, whose names then show as chips on the board.
  onSelectContexts?: (ids: readonly ElementId[]) => void;
}) {
  const zoom = useCanvasZoom();
  const view = useSuggestionView(tabId);
  const hints = useMemo(() => suggestionHints(elements), [elements]);
  const above = useMemo(
    () => new Set(hints.filter((h) => h.side === 'above').map((h) => h.anchorId)),
    [hints],
  );
  const spots = useMemo(() => suggestionSpots(elements), [elements]);
  const timeline = useMemo(() => suggestionsInTimeline(elements), [elements]);
  const marks = useMemo(() => changeMarks(elements, inertIds), [elements, inertIds]);
  const showAll = view.showAll && showAllSpots !== null;
  const rows = useMemo(
    () =>
      panelRows({
        elements,
        timeline,
        showAllSpots: showAll ? showAllSpots : null,
        inertIds,
        layers,
      }),
    [elements, timeline, showAll, showAllSpots, inertIds, layers],
  );
  if (hints.length === 0 && rows.length === 0) return null;

  const preview = (key: string) => () => previewSuggestion(tabId, key);
  const leave = (key: string) => () => leaveSuggestion(tabId, key);
  const decide = (act: () => void) => {
    endSuggestionPreview(tabId);
    act();
  };
  const apply = (id: string) => decide(() => controls.apply(id));
  const dismiss = (id: string) => decide(() => controls.dismiss(id));
  const placeholder = (s: SuggestionElement, spot: Rect, caption: boolean, key: string) => (
    <SuggestionPlaceholder
      key={s.id}
      suggestion={s}
      spot={spot}
      zoom={zoom}
      caption={caption}
      onApply={apply}
      onDismiss={dismiss}
      onPreview={preview(key)}
      onLeave={leave(key)}
    />
  );

  const applyRow = (row: DecidedRow, everywhere = false) => {
    if (row.type === 'lane-plan') decide(controls.applyLanePlan);
    else if (row.type === 'change')
      decide(() =>
        controls.acceptChange(row.note.id, row.change, everywhere ? 'board' : 'context'),
      );
    else apply(row.type === 'note' ? row.suggestion.id : row.context.id);
  };
  const contextIdsOf = (row: ChosenRow) =>
    row.type === 'names' ? [row.context.id] : row.contexts.map((c) => c.id);
  const dismissRow = (row: PanelRow) => {
    if (row.type === 'lane-plan') decide(controls.dismissLanePlan);
    else if (row.type === 'change') decide(() => controls.dismissChange(row.note.id, row.change));
    else if (row.type === 'names' || row.type === 'merge')
      decide(() => controls.dismissNames(contextIdsOf(row)));
    else dismiss(row.type === 'note' ? row.suggestion.id : row.context.id);
  };
  const panel = (
    <SuggestionsPanel
      rows={rows}
      open={view.panelOpen}
      showAll={view.showAll}
      onOpenChange={(open) => setSuggestionsPanelOpen(tabId, open)}
      onShowAllChange={(on) => {
        if (on) track('Canvas', 'Used', 'SuggestionsShown');
        setShowAllSuggestions(tabId, on);
      }}
      onPreview={(row) => {
        previewSuggestion(tabId, panelRowKey(row));
        controls.reveal(panelRowBounds(row));
      }}
      onLeave={(row) => leaveSuggestion(tabId, panelRowKey(row))}
      onApply={applyRow}
      onChoose={(row) => {
        onSelectContexts?.(contextIdsOf(row));
        controls.reveal(row.bounds);
      }}
      onDismiss={dismissRow}
      onApplyAll={() => decide(controls.applyAll)}
      onDismissAll={() => decide(controls.dismissAll)}
    />
  );
  const changes = (
    <NoteChangeMarks
      elements={elements}
      tabId={tabId}
      marks={marks}
      above={above}
      previewKey={view.previewKey}
      offered={offered}
      zoom={zoom}
      controls={controls}
    />
  );

  // What stands on the board: nothing while a whole board is offered (only the panel, whose row is being pointed
  // at), every placeholder under Show All, else the peek tabs with the previewed hint's chain (a panel row shows its
  // one suggestion).
  const onBoard = () => {
    if (offered?.board) return null;
    if (showAll)
      return timeline.map(({ suggestion }) => {
        const key = `s:${suggestion.id}`;
        const spot = showAllSpots.get(suggestion.id);
        return spot ? placeholder(suggestion, spot, view.previewKey === key, key) : null;
      });
    const key = view.previewKey;
    const one = key?.startsWith('s:') ? key.slice(2) : null;
    const previewed = hints.find((h) =>
      one ? h.suggestions.some((s) => s.id === one) : h.key === key,
    );
    const shown = previewed?.suggestions.filter((s) => one === null || s.id === one) ?? [];
    return (
      <>
        {hints.map((hint) => (
          <SuggestionPeekTab
            key={hint.key}
            hint={hint}
            zoom={zoom}
            onPreview={preview(hint.key)}
            onLeave={leave(hint.key)}
            onApply={apply}
            onDismiss={dismiss}
          />
        ))}
        {shown.map((s, i) => placeholder(s, spots.get(s.id)!, i === 0, key!))}
      </>
    );
  };

  // One shape whatever is shown, so the panel is never remounted under a person's focus: its row keeps the keyboard
  // while it previews, and its switch while the board turns to Show All and back.
  return (
    <>
      {onBoard()}
      {offered?.board ? null : changes}
      {panel}
    </>
  );
}
