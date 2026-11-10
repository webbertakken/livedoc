'use client';

import { usePublishDocumentVisibility } from '@/hooks/editor/document-visibility-store';
import { CanvasFocusProvider } from '@/hooks/canvas/useCanvasFocus';
import dynamic from 'next/dynamic';
import { CommentBadgesContext } from '@/components/canvas/CommentBadgesContext';
import { SuppressElementIndicators } from '@/components/canvas/ElementIndicatorStyleContext';
import { EditorModeProvider } from '@/components/chrome/editor-mode/editor-mode-context';
import { tabKindOf, truncateName } from '@livedoc/document';
import { useBugReportPlace } from '@/lib/bug-report/place';
import { openSearchWithPrefetch } from '@/lib/open-search';
import { track } from '@/lib/telemetry';
import { NewVersionPrompt } from '@/components/chrome/NewVersionPrompt';
import { registerUnsavedWork } from '@/lib/unsaved-work';
import { useRegionCycle } from '@/hooks/ui/useRegionCycle';
import { useEffect, useMemo } from 'react';
import { addToDocumentTargets } from '@/lib/add-to-document-targets';
import { canvasSurface } from '@livedoc/document';
import { resolveViewBackdrop } from '@/lib/view-backdrop';
import { CanvasPatternContext } from '@/components/canvas/canvas-pattern-context';
import { readDrawPattern } from '@/lib/whiteboard-dock-prefs';
import { CanvasSurfaceProvider } from '@/components/canvas/CanvasSurfaceContext';
import { CanvasFinishProvider } from '@/components/canvas/CanvasFinishContext';
import { SketchFilterDefs } from '@/components/canvas/SketchFilterDefs';
import { ChangesetRevealContext } from '@/components/canvas/ChangesetRevealOverlay';
import { AgentFocusContext } from '@/components/canvas/AgentFocusOverlay';
import { SelectionStoreProvider } from '@/hooks/canvas/useSelectionStore';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { EditorCanvasHost } from '@/components/canvas/EditorCanvasHost';
import { PlanProvider } from '@/components/plan/PlanContext';
import { FormBoardContext } from '@/components/forms/form-board-context';
import { useFormBoardValue } from '@/hooks/forms/useFormBoardValue';
import { SheetsProviders } from '@/hooks/sheets/sheet-comments-context';
import { PresentationHost } from '@/components/canvas/PresentationHost';
import { ActionsGroup } from '@/components/chrome/lines/ActionsGroup';
import { DocumentGroup } from '@/components/chrome/lines/DocumentGroup';
import { EditorLinesContext } from '@/components/chrome/lines/editor-lines-context';
import { EmbedChrome } from '@/components/chrome/EmbedChrome';
import { WorkbenchReconnectLine } from '@/components/chrome/WorkbenchChrome';
import { appHrefOfPlace } from '@/lib/workbench/workspace-place';

// The document in a full tab, by its link when the frame opened it by one.
const workbenchDocumentHref = (documentId: string, shareCode: string | null) =>
  appHrefOfPlace({ kind: 'document', documentId, tabId: null, shareCode });
import { LandscapeBarFold, LandscapeBarsHandle } from '@/components/chrome/LandscapeBars';
import { useLandscapeBars } from '@/hooks/ui/useLandscapeBars';
import { SplitViewFrame } from '@/components/split/SplitViewFrame';
import { BoardSceneNotice } from '@/components/canvas/BoardSceneNotice';
import { EditorModals } from '@/components/dialogs/EditorModals';
import { PollPromptSheet } from '@/components/panels/PollPromptSheet';
import { FocusInviteDialog } from '@/components/dialogs/FocusInviteDialog';
import { focusPageAt } from '@/lib/focus-audience';
import { EditorTabDialogs } from '@/components/dialogs/EditorTabDialogs';
import { CollaboratorsHost } from '@/components/dialogs/CollaboratorsHost';
import { EditorElementDialogs } from '@/components/dialogs/EditorElementDialogs';
import { EditorContextMenuHost } from '@/components/palette/EditorContextMenuHost';
import { EditorTours } from '@/components/tour/EditorTours';
import { EditorAnchoredPopovers } from '@/components/panels/EditorAnchoredPopovers';
import { ModifierHint } from '@/components/chrome/ModifierHintBanner';
import { loadEditorSearchPanel } from '@/lib/editor-deferred-code';
import { EditorPhotoImport } from '@/components/chrome/EditorPhotoImport';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';
import { useEditorAccent } from '@/hooks/ui/useEditorAccent';
import { useAppearance } from '@/hooks/ui/useAppearance';
import { useEditorContext } from './EditorContext';
import { useSelectTab } from './useSelectTab';
import { useRoleIndicator } from './useRoleIndicator';
import { RolePill, RoleStatusIcon } from '@/components/chrome/RoleIndicator';
import { MinimalChromeProvider } from '@/components/providers/minimal-chrome';
import { isMinimalChrome, isPowerUserMode } from '@/lib/power-user-mode';
import { UiScaleProvider, useUiScalePreview } from '@/components/providers/ui-scale';
import { resolveUiScales } from '@/lib/ui-scale';
import { useIsMobileViewport } from '@/hooks/ui/useIsMobileViewport';
// Each major area fails on its own and reports which one it was (docs/specs/017-telemetry/telemetry.md).
import { AreaErrorBoundary } from '@/components/primitives/AreaErrorBoundary';
import { QuickStyleHost } from '@/components/canvas/QuickStyleHost';
import { buttonLabelsOn, panelEnabled } from '@/lib/user-preferences';
import { EditorStartPanels } from '@/components/start/EditorStartPanels';

// Loaded when first drawn (docs/specs/016-platform/web-performance.md): search while it is open. Its code is
// fetched once the editor is idle (EDITOR_SURFACE_CODE), so opening it does not wait.
const EditorSearchPanel = dynamic(loadEditorSearchPanel, { ssr: false });
// Plan's UI loads only when it is drawn (docs/specs/026-plan/plan-mode.md "Cost"), so a document without
// Plan pays nothing for it.
const PlanSheetsHost = dynamic(
  () => import('@/components/plan/PlanSheetsHost').then((m) => m.PlanSheetsHost),
  { ssr: false },
);

// The editor's full view (header + canvas + tab bar + all dialogs),
// lifted out of editor-page.tsx. Every value/handler it needs is read
// from EditorContext (provided by the page), so the page no longer
// threads ~150 props through this JSX. The JSX is verbatim; only its
// scope changed from the page's locals to the destructured context.
export function EditorView() {
  const ctx = useEditorContext();
  // Offline Mode (docs/specs/006-document/offline-mode.md): a document saved only in this browser. Drives the
  // "This Browser" header badge and hides server-only actions (Share).
  const isOffline = useIsOfflineDocument(ctx.documentId);
  // A full page load the app starts itself (a stale build, a chunk recovery) waits for these edits
  // to be saved (docs/specs/016-platform/stale-builds.md).
  const { hasUnsavedChanges } = ctx;
  useEffect(() => registerUnsavedWork(hasUnsavedChanges), [hasUnsavedChanges]);
  // F6 moves between the header, palette, canvas, controls and tab bar (canvas-accessibility.md).
  useRegionCycle();
  const {
    pasteFromClipboard,
    slideDeck,
    hasClipboard,
    boardSceneInsert,
    activeId,
    activeTab,
    addTab,
    followMe,
    anyWelcomeOpen,
    embedMode,
    // The app's surroundings, and the workbench session (docs/specs/013-workspace/workbench-embeds.md,
    // Surface table).
    appChrome,
    workbench,
    quickStyleDeps,
    livePoll,
    focusInvite,
    livePresence,
    canvasTool,
    drag,
    esBoard,
    clearTabContent,
    closeContextMenu,
    contextMenu,
    copying,
    deleteTab,
    canDeleteDocument,
    deleteDocument,
    loadedTabIds,
    documentId,
    documentList,
    nameDocument,
    documentName,
    documentShareable,
    documentTeamId,
    duplicateTab,
    formatSourceId,
    hydrated,
    setImportOpen,
    canShareDocument,
    isOwner,
    isReadOnly,
    isStructureReadOnly,
    isOutOfScope,
    linkActiveTabTo,
    loadAllTabs,
    makeCopy,
    participantsByTab,
    pendingDraw,
    renameTab,
    renameTabFolder,
    moveTabToFolder,
    removeTabFromFolder,
    reorderTabs,
    connectSourceId,
    cancelConnect,
    selfParticipant,
    sessionRole,
    sessionShareCode,
    setExportOpen,
    setExportScope,
    setSearchOpen,
    setSettingsOpen,
    openSettingsOn,
    setShareDialogOpen,
    renameDocumentNonce,
    renameTabNonce,
    tabs,
    toggleActiveTabLock,
    zenMode,
    openCollaborators,
    userPreferences,
  } = ctx;
  // Minimal chrome (docs/specs/007-editor/power-user-mode.md): one flag, read by every chrome surface.
  const minimalChrome = isMinimalChrome(userPreferences);
  // UI scale (docs/specs/007-editor/ui-scale.md): desktop only, so a phone resolves to 1.
  // While a Settings slider is dragged its patch wins, so the chrome resizes
  // as you go; the preference is written once, on release.
  const uiScalePreview = useUiScalePreview();
  const isMobileViewport = useIsMobileViewport();
  const uiScales = resolveUiScales(
    uiScalePreview === null ? userPreferences : { ...userPreferences, ...uiScalePreview },
    { mobile: isMobileViewport },
  );
  const role = useRoleIndicator();

  const selectTab = useSelectTab();
  // A board's Form strip (docs/specs/030-forms/forms.md "On the board"): the forms feeding the open tab.
  const formBoard = useFormBoardValue({
    tabs,
    activeTabId: activeTab.id,
    documentId: ctx.documentId,
    ownerId: ctx.selfParticipant.id,
    share: ctx.sessionShareCode,
    online: !isOffline,
    canShare: ctx.can.level === 'edit',
    openTab: selectTab,
  });
  // Contextual command palette for the SearchPanel "Actions" group (docs/specs/008-canvas/canvas-and-palette.md):
  // selection-aware command list + dispatcher, built off the same editor
  // actions the menus use. Empty (undefined items) for view-only sessions.
  // Retarget the brand-* accent (buttons, rings, focus) to the active tab's
  // theme so the editor chrome matches the document (docs/specs/011-theme/canvas-and-theme-dialog.md).
  // One look in both editor modes (docs/specs/007-editor/editor-modes.md "One look"), so the accent
  // follows the tab's theme in Draw mode too.
  useEditorAccent(activeTab.theme);
  // Where a bug report was sent from (docs/specs/016-platform/bug-reports.md "Context").
  useBugReportPlace({
    mode: ctx.editorMode.mode,
    tabKind: tabKindOf(activeTab),
    shareRole: isOwner ? 'owner' : ctx.can.level,
  });
  // The viewer's own light / dark chrome (docs/specs/007-editor/live-app.md). Read here because the
  // Default theme resolves through it — see the canvas surface below.
  const { appearance } = useAppearance();
  const backdrop = resolveViewBackdrop(
    activeTab,
    { mode: ctx.editorMode.mode, drawPattern: readDrawPattern(userPreferences) },
    appearance,
  );
  // One value while the style holds, so the covers reading it stay quiet as the editor re-renders.
  const patternScale = activeTab.backgroundPatternScale ?? 1;
  const patternSpeed = activeTab.backgroundAnimationSpeed ?? 1;
  const canvasPattern = useMemo(
    () => ({
      pattern: backdrop.backgroundPattern ?? 'grid',
      color: backdrop.patternColor,
      scale: patternScale,
      speed: patternSpeed,
      opacity: backdrop.backgroundOpacity ?? 1,
    }),
    [
      backdrop.backgroundPattern,
      backdrop.patternColor,
      backdrop.backgroundOpacity,
      patternScale,
      patternSpeed,
    ],
  );

  // The same visibility for the Explorer panel's Current Document card (document-visibility-store).
  usePublishDocumentVisibility(
    documentShareable,
    !!documentTeamId,
    isOffline,
    canShareDocument && hydrated
      ? () => {
          setShareDialogOpen(true);
          track('UI', 'Opened', 'Share');
        }
      : undefined,
  );

  // A phone held sideways folds the actions and document groups (docs/specs/007-editor/live-app.md "A phone held
  // sideways"); a rename asked for elsewhere shows them first, so its field can take the focus.
  const landscapeBars = useLandscapeBars([renameDocumentNonce, renameTabNonce]);

  // The two lines' page-built groups (docs/specs/007-editor/toolbar-layout.md "The two lines"), placed by the
  // canvas chrome (EditorLinesContext). Zen / focus mode (docs/specs/007-editor/zen-mode.md) hides both; embeds
  // (docs/specs/013-workspace/embeds.md) never show them.
  const openShare = () => {
    setShareDialogOpen(true);
    track('UI', 'Opened', 'Share');
  };
  // The actions group, top right: the chrome trio, the document actions, the account. Through the welcome flow the
  // account control alone, so the first-paint chrome stays minimal; in a workbench frame the chrome and Open in
  // LiveDoc alone (no app surroundings); never in an embed.
  const actionsGroup =
    zenMode || embedMode ? null : (
      <LandscapeBarFold shown={landscapeBars.shown}>
        <AreaErrorBoundary area="Actions" fallback="panel">
          <ActionsGroup
            documentActions={!anyWelcomeOpen}
            appSurroundings={appChrome}
            onOpenSearch={() => openSearchWithPrefetch(setSearchOpen, loadAllTabs)}
            onOpenSettings={() => {
              // Preferences are the person's, not the document's, so every role may open them (a Viewer opting out
              // of telemetry for their own browser).
              setSettingsOpen(true);
              track('UI', 'Opened', 'Settings');
            }}
            // Settings > Appearance > Button Labels names Search, Settings and the appearance (never on a phone). Icons
            // alone unless it is turned on, so the top line leaves the strip its room (mock-up F).
            labelled={!minimalChrome && buttonLabelsOn(userPreferences)}
            workbenchOpenHref={
              workbench && documentId
                ? workbenchDocumentHref(documentId, workbench.shareCode)
                : undefined
            }
            // Only the owner or a team member shares (canShareDocument), once the document is up; a visitor sees
            // Make a Copy in the same slot (a joined team member is no visitor: the team's documents are theirs).
            showShare={canShareDocument && hydrated}
            shareable={documentShareable}
            onMakeCopy={
              !canShareDocument && hydrated && !anyWelcomeOpen && documentId
                ? () => void makeCopy()
                : undefined
            }
            copying={copying}
            // The Workshop control (docs/specs/012-collaboration/workshop-mode.md): an Editor's, wherever the mode switch
            // is offered (a general unlocked tab that is not a Plan tab), once the document is up.
            workshop={
              hydrated && ctx.editorMode.canSwitch
                ? { on: ctx.editorMode.workshop, onToggle: ctx.editorMode.setWorkshop }
                : undefined
            }
            // docs/specs/012-collaboration/presentation-mode.md "The header's Present button": only while the deck
            // has a slide to show, on a desktop, once the document is up. Every role.
            present={
              hydrated && !isMobileViewport && slideDeck.runnable.length > 0
                ? {
                    slideCount: slideDeck.runnable.length,
                    starting: slideDeck.startingDeck,
                    onPresent: () => {
                      track('UI', 'Opened', 'HeaderPresent');
                      void slideDeck.start();
                    },
                  }
                : undefined
            }
            onOpenAccount={() => openSettingsOn('account')}
            onOpenShare={openShare}
          />
        </AreaErrorBoundary>
      </LandscapeBarFold>
    );

  // The document group, bottom right: the document's name, the active tab, the tab stack, the contributors, Add
  // tab. Hidden through the welcome flow, in zen mode and in embeds.
  const documentGroup =
    anyWelcomeOpen || zenMode || embedMode ? null : (
      <LandscapeBarFold shown={landscapeBars.shown}>
        <AreaErrorBoundary area="Document" fallback="panel">
          <DocumentGroup
            name={{
              documentName,
              showShare: canShareDocument && hydrated,
              shareable: documentShareable,
              teamDocument: !!documentTeamId,
              offline: isOffline,
              onOpenShare: openShare,
              readOnly: isStructureReadOnly,
              renameNonce: renameDocumentNonce,
              // Minimal chrome swaps the pill for its status icon.
              rolePill: minimalChrome ? (
                <RoleStatusIcon role={role.role} onToggle={role.onToggle} />
              ) : (
                <RolePill {...role} />
              ),
              onRename: (next) => {
                const prev = documentName.trim();
                // docs/specs/006-document/name-length.md: capped here so the rename can't outrun the limit the
                // auto-namer and the Explorer renames both respect.
                const nextTrim = truncateName(next);
                nameDocument(nextTrim);
                if (nextTrim && nextTrim !== prev) track('Document', 'Renamed');
              },
            }}
            tabs={{
              tabs: tabs,
              activeId: activeId,
              // Clicking an avatar in a presence stack opens the Collaborators
              // modal (docs/specs/012-collaboration/collaborator-enhancements.md), which is where Follow (docs/specs/012-collaboration/follow-me-viewport.md) lives.
              followingId: followMe.followingId,
              followerCount: followMe.followerCount,
              onOpenCollaborators: openCollaborators,
              onMoveTabToFolder: moveTabToFolder,
              onRemoveTabFromFolder: removeTabFromFolder,
              onRenameFolder: renameTabFolder,
              activeTabHasContent: activeTab.elements.length > 0,
              onSelect: selectTab,
              onAdd: (choice) => addTab(choice),
              onRename: renameTab,
              onDuplicate: duplicateTab,
              onDelete: deleteTab,
              // The last tab's Delete deletes the document (docs/specs/006-document/document-structure.md "The last tab"),
              // as Delete Document does: into the Trash, then to the Explorer.
              canDeleteDocument: canDeleteDocument && !!documentId,
              onDeleteDocument: () => {
                if (documentId) void deleteDocument(documentId);
              },
              isTabLoaded: (tabId) => loadedTabIds.has(tabId),
              onClearContent: () => void clearTabContent(),
              onImportTab: () => setImportOpen(true),
              onExportTab: () => {
                setExportScope('tab');
                setExportOpen(true);
              },
              otherDocuments: addToDocumentTargets({
                documentId,
                documentList,
                isOffline,
                workbench: workbench !== null,
                isOwner,
              }),
              onCopyTabTo: linkActiveTabTo,
              onToggleLockTab: toggleActiveTabLock,
              onReorder: reorderTabs,
              // A tab-scoped visitor edits their tab's content at most, never the
              // tabs around it (docs/specs/013-workspace/tab-scoped-share-links.md).
              readOnly: isStructureReadOnly,
              isOutOfScope: isOutOfScope,
              renameActiveNonce: renameTabNonce,
              participantsByTab: participantsByTab,
              selfId: selfParticipant.id,
              selfRole: sessionRole,
              // Canvas right-click (desktop) + long-press (touch) open the active
              // tab's menu with the canvas sections folded in, drawn by the document
              // group so it reuses every tab handler. Element / multi context
              // menus stay on EditorContextMenu below.
              canvasMenu: contextMenu?.mode === 'canvas' ? contextMenu : null,
              onCloseCanvasMenu: closeContextMenu,
              canvasActions: {
                // Paste straight from the empty-canvas right-click (docs/specs/008-canvas/canvas-and-palette.md).
                onPaste: () =>
                  pasteFromClipboard(
                    undefined,
                    contextMenu?.mode === 'canvas' ? (contextMenu.canvasPoint ?? null) : null,
                  ),
                canPaste: hasClipboard,
              },
            }}
          />
        </AreaErrorBoundary>
      </LandscapeBarFold>
    );
  const lines = { actions: actionsGroup, document: documentGroup, embed: embedMode };

  // The bars handle, at the canvas's top-right corner: only on a phone held sideways (CSS), and only where there are
  // groups to fold (not in zen, an embed, the welcome flow or a running presentation).
  const landscapeBarsHandle =
    actionsGroup && documentGroup && slideDeck.presentingAt === null ? (
      <LandscapeBarsHandle shown={landscapeBars.shown} onToggle={landscapeBars.toggle} />
    ) : null;

  return (
    // Which paper the canvas is, for every element that carries no colour of
    // its own (docs/specs/007-editor/live-app.md). Read HERE, above both the canvas and the element
    // menus, so a swatch in a menu can't disagree with the shape it describes.
    // Subscribing to the appearance is what re-renders this on a mode switch:
    // a Default tab's paper is the viewer's, not the tab's.
    <SelectionStoreProvider store={ctx.selectionStore}>
      <ViewportStoreProvider store={ctx.viewport}>
        <CanvasSurfaceProvider surface={canvasSurface(backdrop.backgroundColor)}>
          {/* The canvas style, for the pages that cover the canvas and must draw its motion themselves. */}
          <CanvasPatternContext.Provider value={canvasPattern}>
            {/* The active tab's finish (docs/specs/008-canvas/finish.md), for the menus and panels; each
              canvas provides its own tab's again. */}
            <CanvasFinishProvider finish={activeTab.finish}>
              {/* The wobble Sketch palette tiles are drawn through (palette-tile-finish.ts). */}
              <SketchFilterDefs />
              {/* Plan boards and cards, and the dialogs that draw them (exports), read the items and
              their actions here (docs/specs/026-plan/plan-board.md). */}
              <PlanProvider value={ctx.plan.context}>
                <FormBoardContext.Provider value={formBoard}>
                  {/* The sheets bridge, and cell comments (docs/specs/029-sheets/sheet.md "Cell comments"): every Sheet
                opens its cells' threads through the editor's one comment popover. */}
                  <SheetsProviders
                    bridge={ctx.sheetsBridge}
                    openComments={ctx.openComments}
                    openId={ctx.commentThreadOpenId}
                    openCell={ctx.commentThreadOpenCell}
                    canComment={ctx.can.takePart}
                  >
                    <CanvasFocusProvider value={ctx.focusBounds}>
                      <MinimalChromeProvider
                        value={minimalChrome}
                        powerUser={isPowerUserMode(userPreferences)}
                      >
                        <UiScaleProvider value={uiScales}>
                          <EditorModeProvider value={ctx.editorMode}>
                            {/* Side by side tabs (docs/specs/007-editor/split-view.md): the editor, and another
                      tab of the document live beside it when one has been dragged to the right. */}
                            <EditorLinesContext.Provider value={lines}>
                              <SplitViewFrame>
                                {(splitShowing) => (
                                  <div
                                    // The open tab's editor mode, for the e2e helpers (e2e/fixtures.ts).
                                    data-editor-mode={ctx.editorMode.mode}
                                    data-workshop={ctx.editorMode.workshop ? 'on' : undefined}
                                    className="flex h-dvh flex-col"
                                  >
                                    {/* Arrow click-to-connect hint (docs/specs/008-canvas/canvas-and-palette.md): shown while the gesture
          is armed so the user knows the next shape click connects, and
          gives a click target to cancel (clicking empty canvas also
          cancels). */}
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
                                          <span className="text-brand-700 dark:text-brand-300">
                                            Cancel
                                          </span>
                                        </button>
                                      </div>
                                    ) : null}
                                    <AreaErrorBoundary area="TabDialogs">
                                      <EditorTabDialogs />
                                    </AreaErrorBoundary>
                                    <AreaErrorBoundary area="Collaborators">
                                      <CollaboratorsHost />
                                    </AreaErrorBoundary>
                                    {/* At the canvas's top edge, under the header. */}
                                    {landscapeBarsHandle}
                                    <AreaErrorBoundary
                                      area="Canvas"
                                      fallback="panel"
                                      fallbackClassName="flex-1"
                                    >
                                      {/* The outlines relayed changesets draw (docs/specs/024-agents/agent-changesets.md). */}
                                      <ChangesetRevealContext.Provider value={ctx.changesetReveals}>
                                        {/* The focus rings of the agents present (docs/specs/024-agents/agent-presence.md). */}
                                        <AgentFocusContext.Provider value={ctx.agentFocusByElement}>
                                          {/* No comment badges for a viewer in an embed (docs/specs/013-workspace/embeds.md). */}
                                          <CommentBadgesContext.Provider
                                            value={!(embedMode && isReadOnly)}
                                          >
                                            {/* Indicators are editor chrome: an embed never draws them (docs/specs/008-canvas/element-indicators.md). */}
                                            <SuppressElementIndicators when={embedMode}>
                                              <EditorCanvasHost />
                                            </SuppressElementIndicators>
                                          </CommentBadgesContext.Provider>
                                        </AgentFocusContext.Provider>
                                      </ChangesetRevealContext.Provider>
                                      {ctx.plan.openItemId || ctx.plan.editingType ? (
                                        <PlanSheetsHost plan={ctx.plan} />
                                      ) : null}
                                    </AreaErrorBoundary>
                                    {/* Presenting (docs/specs/012-collaboration/presentation-mode.md) renders over everything and takes the keyboard.
          Nothing at all when no deck is running. */}
                                    <AreaErrorBoundary area="Presentation">
                                      <PresentationHost />
                                    </AreaErrorBoundary>
                                    {embedMode ? (
                                      // Embed chrome (docs/specs/013-workspace/embeds.md): the link-out badge + a minimal tab
                                      // switcher replace the full TabBar. Same selection clears as
                                      // the TabBar's onSelect so element state never leaks across a
                                      // tab switch.
                                      <EmbedChrome
                                        tabs={tabs}
                                        activeId={activeId}
                                        shareCode={sessionShareCode}
                                        onSelectTab={selectTab}
                                      />
                                    ) : null}
                                    {workbench ? (
                                      // The workbench's Reconnect line; its Open in LiveDoc sits in the tab bar.
                                      <WorkbenchReconnectLine
                                        workbenchName={workbench.workbenchName}
                                        ended={workbench.ended}
                                      />
                                    ) : null}
                                    {/* Quick style panel (docs/specs/008-canvas/quick-style-panel.md): the most-used style choices beside
              a selection. Stands down in zen / embeds / presenting and while an
              element menu is open, which is the complete home of every setting. */}
                                    <AreaErrorBoundary area="QuickStyle">
                                      <QuickStyleHost
                                        deps={quickStyleDeps}
                                        hidden={
                                          // Not beside another tab (docs/specs/007-editor/split-view.md): half a window has
                                          // no room for it next to the selection.
                                          splitShowing ||
                                          zenMode ||
                                          embedMode ||
                                          // Not in Plan mode (docs/specs/026-plan/plan-mode.md): a board's look is its theme's.
                                          ctx.editorMode.mode === 'plan' ||
                                          // Off in Settings (docs/specs/007-editor/user-preferences.md); style memory stays.
                                          !panelEnabled(
                                            userPreferences,
                                            'quickStylePanelEnabled',
                                          ) ||
                                          (contextMenu !== null && contextMenu.mode !== 'canvas')
                                        }
                                        powerUser={isPowerUserMode(userPreferences)}
                                      />
                                    </AreaErrorBoundary>
                                    {ctx.searchOpen ? (
                                      <AreaErrorBoundary area="Search">
                                        <EditorSearchPanel />
                                      </AreaErrorBoundary>
                                    ) : null}
                                    {/* Live poll (docs/specs/012-collaboration/live-poll.md). The prompt is shown to EVERY participant
          including view-role; the results panel unlocks once you've
          responded (or if you're the host). Both vanish with the poll —
          nothing here is persisted. */}
                                    <PollPromptSheet
                                      // Keyed on the poll so a second poll starts with a clean free-text
                                      // box rather than inheriting the first one's half-typed answer.
                                      key={livePoll.poll?.id ?? 'no-poll'}
                                      // Asked of whoever may answer (docs/specs/013-workspace/share-roles.md): a Viewer only looks.
                                      poll={
                                        ctx.can.takePart && livePoll.poll && !livePoll.myAnswer
                                          ? livePoll.poll
                                          : null
                                      }
                                      onAnswer={livePoll.answerPoll}
                                    />
                                    {/* Bring Focus (docs/specs/012-collaboration/bring-focus.md). A dialog like the poll prompt above, and for
          the same reason: it is a question addressed to you, not a status
          line. Shown to view-role visitors too. */}
                                    <FocusInviteDialog
                                      from={
                                        focusInvite.invite
                                          ? (livePresence.find(
                                              (p) => p.id === focusInvite.invite!.from,
                                            )?.name ?? 'Someone')
                                          : null
                                      }
                                      toPage={
                                        !!focusInvite.invite &&
                                        !!focusPageAt(
                                          tabs.find((t) => t.id === focusInvite.invite!.tabId),
                                          focusInvite.invite.at,
                                        )
                                      }
                                      onAccept={focusInvite.acceptFocus}
                                      onDismiss={focusInvite.dismissFocus}
                                    />
                                    <AreaErrorBoundary area="Modals">
                                      <EditorModals />
                                    </AreaErrorBoundary>
                                    <AreaErrorBoundary area="Popovers">
                                      <EditorAnchoredPopovers />
                                    </AreaErrorBoundary>
                                    <AreaErrorBoundary area="ContextMenu">
                                      <EditorContextMenuHost />
                                    </AreaErrorBoundary>
                                    <AreaErrorBoundary area="ElementDialogs">
                                      <EditorElementDialogs />
                                    </AreaErrorBoundary>
                                    {/* Interactive editor tour (docs/specs/007-editor/editor-tour.md): renders nothing unless the /new
          wizard's "Show me around" handoff flag is pending. */}
                                    <AreaErrorBoundary area="Tour">
                                      <EditorTours />
                                    </AreaErrorBoundary>

                                    {/* What a pasted board brought across (docs/specs/020-import-export/board-scene.md). */}
                                    <BoardSceneNotice
                                      notice={boardSceneInsert.notice}
                                      onClose={boardSceneInsert.dismissNotice}
                                    />
                                    <EditorStartPanels />

                                    {/* Modifier hint (docs/specs/008-canvas/canvas-and-palette.md, docs/specs/021-event-storming/event-storming.md): names what holding Shift does
          right now, and offers the Alt insert-between gesture while a note is
          on the move. Suppressed while a mode banner owns the top slot. */}
                                    {minimalChrome ? null : (
                                      <ModifierHint
                                        readOnly={isReadOnly}
                                        drag={drag}
                                        esBoard={esBoard}
                                        elements={activeTab.elements}
                                        hasElements={activeTab.elements.length > 0}
                                        suppressed={
                                          canvasTool === 'format' ||
                                          formatSourceId !== null ||
                                          pendingDraw !== null
                                        }
                                      />
                                    )}

                                    <EditorPhotoImport />

                                    {/* An editor older than the server's document format offers a reload, once its edits
            are saved (docs/specs/016-platform/new-version-prompt.md). */}
                                    <NewVersionPrompt hasUnsavedChanges={ctx.hasUnsavedChanges} />
                                  </div>
                                )}
                              </SplitViewFrame>
                            </EditorLinesContext.Provider>
                          </EditorModeProvider>
                        </UiScaleProvider>
                      </MinimalChromeProvider>
                    </CanvasFocusProvider>
                  </SheetsProviders>
                </FormBoardContext.Provider>
              </PlanProvider>
            </CanvasFinishProvider>
          </CanvasPatternContext.Provider>
        </CanvasSurfaceProvider>
      </ViewportStoreProvider>
    </SelectionStoreProvider>
  );
}
