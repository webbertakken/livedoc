'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useExplorer } from './ExplorerContext';
import { useDocumentEntryFor, useExplorerDocumentsById } from './useDocumentEntryFor';
import type { HelpArticleKey } from '@/lib/help-articles';
import { ListView, PaneHeader, SharedList, SkeletonRows, type PaneDocument } from './views';
import { CardView } from './CardView';
import { DetailsView } from './details/DetailsView';
import { useExplorerViewMode } from './useExplorerViewMode';
import { EmptyPane } from './ExplorerEmptyState';
import { ViewInfo } from './ViewInfo';
import { PaneLensBar } from './lens/PaneLensBar';
import { FilteredEmpty, LoadFailed } from './lens/LensStates';
import { narrowRows } from './lens/pane-lens';
import { TitleHighlightProvider } from './lens/TitleHighlight';
import { TimelineControls } from '@livedoc/ui';
import { DocumentHistoryDialog } from '@/components/panels/DocumentHistoryDialog';
import { isOfflineIdSync } from '@/lib/offline/offline-store';
import { useTimelineFeed } from './useTimelineFeed';
import { useExplorerImport } from './useExplorerImport';
import { explorerPathFor } from './routes';
import { rowLocation } from './row-location';
import { paneHeaderActions } from './pane-header-actions';
import { useTagsPage } from './tags/useTagsPage';
import {
  fetchPaneCode,
  loadGalleryPane,
  loadHomePane,
  loadInboxPane,
  loadShapeLibrariesPane,
  loadTagsPane,
  loadTeamInvitesPane,
  loadTeamPane,
  loadThemesPane,
  loadTimelinePane,
  loadTrashSection,
} from './explorer-pane-code';

// The three layouts of a browse section, by the toggle.
const VIEW_COMPONENTS = { list: ListView, card: CardView, details: DetailsView } as const;

// The browse sections that render a folders + documents grid the List/Card
// toggle (docs/specs/006-document/document-snapshots.md) can swap. Other sections (gallery, themes,
// profile, team, invites, shared) have their own fixed layout.
const BROWSE_KINDS = new Set([
  'recent',
  'all',
  'folder',
  'search',
  'favourites',
  'offline',
  'tags',
]);

// Each Explorer section deep-links its matching help-centre article from a
// Help button in the pane header (docs/specs/018-help/contextual-help-links.md); the button's hover card copy comes
// from HELP_LINK_COPY. Sections without a guide (team, invites) simply omit
// it.
const SECTION_HELP: Partial<Record<string, HelpArticleKey>> = {
  // The Home article covers Home and the Timeline (docs/specs/013-workspace/explorer-home.md).
  home: 'timeline',
  timeline: 'timeline',
  inbox: 'inbox',
  recent: 'recentDocuments',
  shared: 'sharedWithYou',
  gallery: 'imageGallery',
  themes: 'customThemes',
  trash: 'trash',
  offline: 'offlineMode',
  folder: 'folders',
  all: 'folders',
  search: 'explorerFilters',
  tags: 'tags',
};

// The heavier panes load on demand (explorer-pane-code.ts): each is only mounted on its own route, so none of them
// sit in the shared explorer chunk. Home and the Timeline are landing routes, split all the same: their code would
// otherwise ride with every other section's first paint.
const GalleryPane = dynamic(loadGalleryPane, { ssr: false });
const TrashSection = dynamic(loadTrashSection, { ssr: false });
const ThemesPane = dynamic(loadThemesPane, { ssr: false });
const ShapeLibrariesPane = dynamic(loadShapeLibrariesPane, { ssr: false });
const TeamPane = dynamic(loadTeamPane, { ssr: false });
const TeamInvitesPane = dynamic(loadTeamInvitesPane, { ssr: false });
const TimelinePane = dynamic(loadTimelinePane, { ssr: false });
const HomePane = dynamic(loadHomePane, { ssr: false });
const TagsPane = dynamic(loadTagsPane, { ssr: false });
const InboxPane = dynamic(loadInboxPane, { ssr: false });

// The right pane for whichever /explorer/<section> route is active:
// PaneHeader (title, breadcrumb, contextual CTAs) + the section's
// content. One component for every route page so the sections can't
// drift apart visually — each page under /explorer just renders this;
// the section itself is derived from the URL in useExplorerState.
export function ExplorerPane() {
  const {
    prefs,
    documents: liveDocs,
    teamDocuments,
    folderById,
    favouriteIds,
    toggleFavourite,
    toggleRecentExclusion,
    selected,
    go,
    loading,
    ownerId,
    refreshPersonal,
    accountId,
    accountDisplayName,
    activity,
    paneTitle,
    paneCrumbs,
    paneContent,
    lens,
    lensResult,
    failedReads,
    childrenByParent,
    documentsByFolder,
    setMobileNavOpen,
    createFolder,
    commitRenameFolder,
    renamingFolderId,
    setRenamingFolderId,
    renamingDocumentId,
    setRenamingDocumentId,
    renameDocument,
    deleteDocument,
    duplicateDocument,
    openMovePickerForDocument,
    folderActions,
    shared,
    dismissShared,
    invites,
    acceptInvite,
    declineInvite,
    refreshTeams,
    movePersonalFolders,
    moveTeamDests,
    moveDocumentTo,
    timelineUnread,
    refreshAfterTeamPage,
  } = useExplorer();
  // The shared rows the pane's documents still show, in their order (best match first under a lens), by
  // id: a scan of the documents per shared row was quadratic, rerun on every keystroke in the lens (63 ms at
  // 1,000 rows).
  const shownShared = useMemo(() => {
    const byId = new Map(shared.map((s) => [s.id, s]));
    return paneContent.documents.flatMap((d) => byId.get(d.id) ?? []);
  }, [shared, paneContent.documents]);

  // A team you're not a member of 404s in TeamPane (it doesn't leak the
  // name). When that happens, drop the title/breadcrumb above it — there
  // is no team to name. Kept with the node it was found missing in, so a
  // real team's title is never suppressed by a stale 404 from the last one.
  const [notFoundIn, setNotFoundIn] = useState<typeof selected | null>(null);
  const teamNotFound = notFoundIn === selected;
  // Where each row lives (docs/specs/013-workspace/recent-folder-chip.md), on the views that list more than one place
  // (row-location.ts).
  const folderChipFor = useCallback(
    (d: PaneDocument): { label: string; onOpen: () => void } | null => {
      const where = rowLocation(d, {
        selected,
        lensActive: lensResult.active,
        folderById,
      });
      return where ? { label: where.label, onOpen: () => go(where.opens) } : null;
    },
    [selected, folderById, go, lensResult.active],
  );

  // The Tags page (docs/specs/013-workspace/tags.md): a tag's name as the title, New Tag, and the documents its tags
  // can sit on (the reader's own and their teams'), newest first.
  const tagsPage = useTagsPage(selected, go);
  const taggable = useMemo(
    () =>
      selected.kind === 'tags'
        ? [...liveDocs, ...teamDocuments].sort((a, b) => b.savedAt - a.savedAt)
        : [],
    [selected.kind, liveDocs, teamDocuments],
  );

  const hideTeamTitle = selected.kind === 'team' && teamNotFound;
  const sectionHelp = SECTION_HELP[selected.kind];
  const [viewMode, setViewMode] = useExplorerViewMode();
  // The toggle only appears on the browse sections (the ones the
  // List/Card swap below applies to).
  const isBrowse = BROWSE_KINDS.has(selected.kind);
  // The section's pane is asked for as the section is chosen, alongside the reads that let it draw
  // (explorer-pane-code.ts), rather than after them.
  const sectionKind = selected.kind;
  useEffect(() => fetchPaneCode(sectionKind), [sectionKind]);
  // The Timeline's data + control state lives here rather than inside
  // its pane, because its controls render in the header row below while
  // its feed renders in the body. Gated like the other section hooks so
  // visiting Recent doesn't fetch a feed nobody is looking at.
  const timeline = useTimelineFeed(ownerId, selected.kind === 'timeline');
  // Which document's history dialog is open, if any (docs/specs/013-workspace/timeline.md §3.4).
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  // Home's Jump Back In cards carry each document's Explorer menu (docs/specs/013-workspace/explorer-home.md).
  const showHistory = useCallback((id: string, name: string) => setHistoryFor({ id, name }), []);
  const homeDocumentMenus = useDocumentEntryFor({ onShowHistory: showHistory });
  // The history dialog's header and summary read the document's row (whose it is, when made).
  const documentsById = useExplorerDocumentsById();

  // Which of New document, New folder and Import from this section offers (pane-header-actions.ts).
  const offers = paneHeaderActions(selected.kind);
  // Where a new document goes: the folder shown, else no choice (docs/specs/013-workspace/new-document-menu.md
  // "Where it goes"). Memoised so the menu's handlers keep their identity across renders.
  const folderId = selected.kind === 'folder' ? selected.id : null;
  const newDocumentPlace = useMemo(
    () => (offers.newDocument ? (folderId ? { folderId } : {}) : undefined),
    [offers.newDocument, folderId],
  );
  // Imports sit beside New document: imported boards land where new documents do.
  const imports = useExplorerImport({
    ownerId,
    folderId: selected.kind === 'folder' ? selected.id : null,
    onDocumentsCreated: () => {
      if (ownerId) void refreshPersonal(ownerId);
    },
  });

  // List, Card and Details take the SAME props (docs/specs/006-document/document-snapshots.md,
  // docs/specs/013-workspace/explorer-details-view.md), so build them once and pick the component by the toggle. The
  // Tags page draws each tag's documents with them too.
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const documentViewProps = {
    ownerId,
    onOpenFolder: (id: string) => go({ kind: 'folder', id }),
    onCommitRenameFolder: commitRenameFolder,
    onCancelRenameFolder: () => setRenamingFolderId(null),
    renamingFolderId,
    renamingDocumentId,
    onCommitRenameDocument: renameDocument,
    onCancelRenameDocument: () => setRenamingDocumentId(null),
    folderActions,
    onStartRenameDocument: (id: string) => setRenamingDocumentId(id),
    onDuplicateDocument: (id: string) => void duplicateDocument(id),
    onDeleteDocument: (id: string) => void deleteDocument(id),
    onMoveDocument: openMovePickerForDocument,
    onDismissShared: (id: string) => void dismissShared(id),
    recentExcludedIds: prefs.recentExcludedIds ?? [],
    onToggleRecentExclusion: toggleRecentExclusion,
    onShowHistory: (id: string) => {
      const row =
        paneContent.documents.find((d) => d.id === id) ?? taggable.find((d) => d.id === id);
      // Offline documents never reach the worker, so they have
      // no server history to show (docs/specs/006-document/offline-mode.md).
      if (row && !isOfflineIdSync(id)) setHistoryFor({ id, name: row.name });
    },
    favouriteIds,
    onToggleFavourite: toggleFavourite,
    folderChipFor,
    childrenCount: (id: string) => childrenByParent.get(id)?.length ?? 0,
    documentsCount: (id: string) => documentsByFolder.get(id)?.length ?? 0,
    // What each folder card previews (docs/specs/013-workspace/folder-content-previews.md) — the same
    // client-side indexes the counts come from, so no extra fetch.
    folderContents: (id: string) => ({
      folders: childrenByParent.get(id) ?? [],
      documents: documentsByFolder.get(id) ?? [],
    }),
  };

  return (
    // The lens's words marked in every listed name (explorer-filters.md "Matching").
    <TitleHighlightProvider text={lensResult.text}>
      {imports.dialogs}
      {tagsPage.dialog}
      <PaneHeader
        title={hideTeamTitle ? '' : (tagsPage.title ?? paneTitle)}
        crumbs={hideTeamTitle ? [] : (tagsPage.crumbs ?? paneCrumbs)}
        onOpenNav={() => setMobileNavOpen(true)}
        helpArticle={sectionHelp}
        headerActions={
          selected.kind === 'timeline' || offers.importFrom || tagsPage.headerActions ? (
            <>
              {selected.kind === 'timeline' ? (
                <TimelineControls controls={timeline.controls} />
              ) : null}
              {offers.importFrom ? imports.toolbar : null}
              {tagsPage.headerActions}
            </>
          ) : undefined
        }
        viewMode={isBrowse ? viewMode : undefined}
        onSetViewMode={isBrowse ? setViewMode : undefined}
        newDocumentPlace={newDocumentPlace}
        onCreateFolder={
          offers.newFolder
            ? () => void createFolder(selected.kind === 'folder' ? selected.id : null)
            : undefined
        }
        folderLabel={selected.kind === 'folder' ? 'New Subfolder' : 'New Folder'}
      />

      {/* A view the app gathers explains itself under the breadcrumb. */}
      <ViewInfo selected={selected} />
      {/* The lens's chips and live region (explorer-filters.md "The chip row"). */}
      {lens.view !== null ? (
        <PaneLensBar
          showIssues={!(lensResult.active && lensResult.shown === 0 && !lensResult.empty)}
        />
      ) : null}

      {/* Timeline runs ahead of the `loading` gate on purpose: that flag
          tracks the DOCUMENT lists, which this section doesn't read, and
          waiting on them would show document skeletons on the landing
          page before the feed's own skeleton. */}
      {selected.kind === 'home' ? (
        // Ahead of the `loading` gate, like the Timeline: Home reads its own data.
        ownerId ? (
          <HomePane
            ownerId={ownerId}
            onSeen={timelineUnread.clear}
            timelineHref={explorerPathFor({ kind: 'timeline' })}
            onSeeTimeline={() => go({ kind: 'timeline' })}
            recentHref={explorerPathFor({ kind: 'recent' })}
            onSeeMore={() => go({ kind: 'recent' })}
            importToolbar={imports.toolbar}
            documentMenus={homeDocumentMenus}
          />
        ) : null
      ) : selected.kind === 'timeline' ? (
        ownerId ? (
          <TimelinePane
            feed={timeline}
            ownerId={ownerId}
            onShowHistory={(id, name) => setHistoryFor({ id, name })}
          />
        ) : null
      ) : selected.kind === 'inbox' ? (
        // Like the Timeline, ahead of the document-list `loading` gate: the
        // section reads its own feed (docs/specs/013-workspace/inbox.md §5).
        ownerId ? (
          <InboxPane feed={activity} ownerId={ownerId} />
        ) : null
      ) : loading ? (
        <SkeletonRows />
      ) : selected.kind === 'invites' ? (
        <TeamInvitesPane
          invites={invites}
          onAccept={(invite) =>
            void acceptInvite(invite).then((teamId) => {
              if (teamId) go({ kind: 'team', id: teamId });
            })
          }
          onDecline={(invite) => void declineInvite(invite)}
        />
      ) : selected.kind === 'team' ? (
        ownerId ? (
          <TeamPane
            ownerId={ownerId}
            teamId={selected.id}
            accountId={accountId ?? null}
            accountDisplayName={accountDisplayName}
            onTeamsChanged={() => void refreshTeams()}
            onLeftTeam={() => go({ kind: 'home' })}
            onLoadResult={(found) => setNotFoundIn(found ? null : selected)}
            // The shared-documents move picker offers every space (docs/specs/013-workspace/team-shared-documents.md):
            // the personal tree + each team, with `moveDocumentTo` routing a
            // cross-scope pick from the document's current placement.
            moveDests={{ personalFolders: movePersonalFolders, teams: moveTeamDests }}
            onMoveDocumentTo={moveDocumentTo}
            // What the team page changes, the sidebar, search and every move picker show at once.
            onLibraryChange={refreshAfterTeamPage}
            // The team library reads its own rows, so it narrows them itself.
            lens={{
              active: lensResult.active,
              input: lens.input,
              issues: lens.parsed.issues,
              narrow: (rows) => narrowRows(rows, lens.parsed.lens, ownerId, lens.now),
              clear: () => lens.setInput(''),
            }}
          />
        ) : null
      ) : selected.kind === 'gallery' ? (
        ownerId ? (
          <GalleryPane ownerId={ownerId} />
        ) : null
      ) : selected.kind === 'themes' ? (
        <ThemesPane />
      ) : selected.kind === 'shape-libraries' ? (
        <ShapeLibrariesPane />
      ) : selected.kind === 'trash' ? (
        <TrashSection />
      ) : selected.kind === 'tags' ? (
        <TagsPane
          documents={taggable}
          tagId={selected.id}
          onOpenTag={tagsPage.openTag}
          onNewTag={tagsPage.newTag}
          renderDocuments={(documents) => (
            // A tag gathers personal and team documents, so whose each is varies (the Owner column).
            <ViewComponent {...documentViewProps} folders={[]} documents={documents} showOwner />
          )}
        />
      ) : (selected.kind === 'shared' ? failedReads.shared : failedReads.documents) ? (
        // A failed read never reads as an empty account (explorer-filters.md "States").
        <LoadFailed onRetry={() => (ownerId ? void refreshPersonal(ownerId) : undefined)} />
      ) : lensResult.empty ? (
        <EmptyPane selected={selected} />
      ) : lensResult.active && lensResult.shown === 0 ? (
        <FilteredEmpty issues={lens.parsed.issues} onClear={() => lens.setInput('')} />
      ) : selected.kind === 'shared' ? (
        <SharedList
          shared={shownShared}
          ownerId={ownerId}
          onDismiss={(id) => void dismissShared(id)}
        />
      ) : (
        <ViewComponent
          {...documentViewProps}
          folders={paneContent.folders}
          documents={paneContent.documents}
          // Owner column (desktop): the views that mix personal, team and shared rows
          // (docs/specs/013-workspace/team-shared-documents.md) are the ones where ownership varies.
          showOwner={selected.kind === 'recent' || selected.kind === 'search'}
        />
      )}

      {/* One document's own history (docs/specs/013-workspace/timeline.md §3.4), opened from a row's
          menu. Lives at the pane level rather than per row so only one
          is ever mounted. */}
      {ownerId ? (
        <DocumentHistoryDialog
          open={historyFor !== null}
          onClose={() => setHistoryFor(null)}
          ownerId={ownerId}
          documentId={historyFor?.id ?? null}
          documentName={historyFor?.name ?? null}
          document={historyFor ? documentsById.get(historyFor.id) : undefined}
        />
      ) : null}
    </TitleHighlightProvider>
  );
}
