'use client';

import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { BoardSceneNotice } from '@/components/canvas/BoardSceneNotice';
import { QuickStyleHost } from '@/components/canvas/QuickStyleHost';
import { EditorPhotoImport } from '@/components/chrome/EditorPhotoImport';
import { ModifierHint } from '@/components/chrome/ModifierHintBanner';
import { EditorElementDialogs } from '@/components/dialogs/EditorElementDialogs';
import { EditorContextMenuHost } from '@/components/palette/EditorContextMenuHost';
import { AreaErrorBoundary } from '@/components/primitives/AreaErrorBoundary';
import { EditorStartPanels } from '@/components/start/EditorStartPanels';
import { isMinimalChrome, isPowerUserMode } from '@/lib/power-user-mode';
import { panelEnabled } from '@/lib/user-preferences';

// The chrome only a canvas uses (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"), mounted
// beside the canvas and loaded with it, never on a tab that has a surface: the arrow-connect hint, the quick style
// panel, the element menus and dialogs, the board scene notice, the starts, the modifier hint and the photo import.
// In two parts, each where the editor drew it before: `panel` (the connect hint and the quick style panel) beside the
// search panel, `overlays` (menus, dialogs, notices and hints) after the editor's modals and popovers.
export type CanvasChromePart = 'panel' | 'overlays';

export function EditorCanvasChrome({
  part,
  splitShowing,
}: {
  part: CanvasChromePart;
  splitShowing: boolean;
}) {
  const {
    connectSourceId,
    cancelConnect,
    quickStyleDeps,
    zenMode,
    embedMode,
    editorMode,
    userPreferences,
    contextMenu,
    boardSceneInsert,
    isReadOnly,
    dragStore,
    esBoard,
    activeTab,
    canvasTool,
    formatSourceId,
    pendingDraw,
  } = useEditorContext();
  if (part === 'overlays')
    return (
      <>
        <AreaErrorBoundary area="ContextMenu">
          <EditorContextMenuHost />
        </AreaErrorBoundary>
        <AreaErrorBoundary area="ElementDialogs">
          <EditorElementDialogs />
        </AreaErrorBoundary>
        {/* What a pasted board brought across (docs/specs/020-import-export/board-scene.md). */}
        <BoardSceneNotice
          notice={boardSceneInsert.notice}
          onClose={boardSceneInsert.dismissNotice}
        />
        {/* The canvas's starts and hints. */}
        <EditorStartPanels />
        {/* Modifier hint (docs/specs/008-canvas/canvas-and-palette.md, docs/specs/021-event-storming/event-storming.md):
          names what holding Shift does right now, and offers the Alt insert-between gesture while a note is on the
          move. Suppressed while a mode banner owns the top slot. */}
        {isMinimalChrome(userPreferences) ? null : (
          <ModifierHint
            readOnly={isReadOnly}
            dragStore={dragStore}
            esBoard={esBoard}
            elements={activeTab.elements}
            hasElements={activeTab.elements.length > 0}
            suppressed={canvasTool === 'format' || formatSourceId !== null || pendingDraw !== null}
          />
        )}
        <EditorPhotoImport />
      </>
    );
  return (
    <>
      {/* Arrow click-to-connect hint (docs/specs/008-canvas/canvas-and-palette.md): shown while the gesture is armed
          so the user knows the next shape click connects, and gives a click target to cancel (clicking empty canvas
          also cancels). */}
      {connectSourceId !== null ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[var(--z-modal)] flex justify-center">
          <button
            type="button"
            onClick={cancelConnect}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm transition hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
          >
            Click a shape to connect the arrow
            <span className="text-brand-300" aria-hidden>
              |
            </span>
            <span className="text-brand-700 dark:text-brand-300">Cancel</span>
          </button>
        </div>
      ) : null}
      {/* Quick style panel (docs/specs/008-canvas/quick-style-panel.md): the most-used style choices beside a
          selection. Stands down in zen / embeds / presenting and while an element menu is open, which is the
          complete home of every setting. */}
      <AreaErrorBoundary area="QuickStyle">
        <QuickStyleHost
          deps={quickStyleDeps}
          hidden={
            // Not beside another tab (docs/specs/007-editor/split-view.md): half a window has no room for it next
            // to the selection.
            splitShowing ||
            zenMode ||
            embedMode ||
            // Not in Plan mode (docs/specs/026-plan/plan-mode.md): a board's look is its theme's.
            editorMode.mode === 'plan' ||
            // Off in Settings (docs/specs/007-editor/user-preferences.md); style memory stays.
            !panelEnabled(userPreferences, 'quickStylePanelEnabled') ||
            (contextMenu !== null && contextMenu.mode !== 'canvas')
          }
          powerUser={isPowerUserMode(userPreferences)}
        />
      </AreaErrorBoundary>
    </>
  );
}
