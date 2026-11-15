'use client';

import { useMemo, useRef } from 'react';
import { compileTitleQuery, rankByTitle } from '@livedoc/explorer-lens';
import { TitleHighlightProvider } from '@/app/explorer/lens/TitleHighlight';
import { memoryPlaces } from '@/components/primitives/windowed-list/list-places';
import { WindowedPaneList } from '../explorer-panel/WindowedPaneList';
import { PanelFindField, usePanelFind } from './PanelFind';
import { useDefaultFolderMenus } from '@/hooks/persistence/useDefaultFolderMenus';
import type { DocumentListItem, SharedWithItem } from '@/lib/api-client';
import { sharedToPaneDocument, type PaneDocument, type SelectedNode } from '@/app/explorer/views';
import { EmptyPane } from '@/app/explorer/ExplorerEmptyState';
import { BackBar } from '@/components/primitives/BackBar';
import { groupDocumentsByFolder, indexFolders } from '@/lib/folder-tree';
import type { PanelSection } from '../explorer-panel/panel-sections';
import { PaneGrid, PaneSkeleton } from '../explorer-panel/pane-parts';
import { PanelFolderItem, type PanelFolder, type PanelFolderIndex } from './PanelFolderItem';
import { PanelDocumentItem } from './PanelDocumentItem';
import { PanelTagsSection } from './PanelTagsSection';
import { PanelTreeProvider, type PanelTree } from './PanelTreeContext';

export type PanelTreeSection = Extract<
  PanelSection,
  { kind: 'mine' } | { kind: 'team' } | { kind: 'browser' } | { kind: 'shared' } | { kind: 'tags' }
>;

export const isTreeSection = (s: PanelSection): s is PanelTreeSection =>
  s.kind === 'mine' ||
  s.kind === 'team' ||
  s.kind === 'browser' ||
  s.kind === 'shared' ||
  s.kind === 'tags';

const NO_FOLDERS: PanelFolder[] = [];

// The folder the pane shows, and so where its New Folder lands: the open one while it is still among the space's
// folders, else the space's root (a folder deleted or moved away while open).
export function paneFolderParent(
  folders: Iterable<{ id: string }>,
  folderId: string | null,
): string | null {
  if (!folderId) return null;
  for (const f of folders) if (f.id === folderId) return folderId;
  return null;
}
const NO_DOCUMENTS: DocumentListItem[] = [];

// The rows of one of the editor's Explorer sections that hold documents (docs/specs/013-workspace/explorer-structure.md
// "The pane"): My Documents' and a team's folders then documents, opening a folder in place under a breadcrumb back
// to the space's root; This Browser's documents; what is shared with the reader. Each empty place says so in the
// Explorer's own empty state.
export function PanelExplorerTree({
  section,
  rootLabel,
  tree,
  busy = false,
  shared,
  ownIndex,
  offlineDocuments,
  teams,
  foldersByTeam,
  documentsByTeam,
  folderId,
  onOpenFolder,
}: {
  section: PanelTreeSection;
  // The space's name, the breadcrumb's first step.
  rootLabel: string;
  tree: PanelTree;
  // The document lists are still loading.
  busy?: boolean;
  shared: SharedWithItem[];
  // The reader's own tree, this browser's documents excluded.
  ownIndex: PanelFolderIndex;
  offlineDocuments: DocumentListItem[];
  teams: { id: string; name: string }[];
  foldersByTeam: Map<string, PanelFolder[]>;
  documentsByTeam: Map<string, DocumentListItem[]>;
  // The folder open in the pane, null at the space's root. The host holds it, so its header's New Folder makes the
  // folder in the one open here (paneFolderParent).
  folderId: string | null;
  onOpenFolder: (id: string | null) => void;
}) {
  // The reader's default folders (docs/specs/013-workspace/default-folders.md): the folder menus check and set them.
  const defaultFolders = useDefaultFolderMenus(
    tree.ownerId,
    useMemo(
      () => ({
        personal: [...ownIndex.foldersByParent.values()].flat(),
        team: Object.fromEntries(foldersByTeam),
        teams,
      }),
      [ownIndex, foldersByTeam, teams],
    ),
  );
  const team = section.kind === 'team' ? teams.find((t) => t.id === section.id) : undefined;
  const teamFolders = (team && foldersByTeam.get(team.id)) || NO_FOLDERS;
  const teamDocuments = (team && documentsByTeam.get(team.id)) || NO_DOCUMENTS;
  const teamIndex = useMemo<PanelFolderIndex>(
    () => ({
      foldersByParent: indexFolders(teamFolders).childrenByParent,
      documentsByFolder: groupDocumentsByFolder(teamDocuments),
    }),
    [teamFolders, teamDocuments],
  );
  const draggable = !!tree.onMoveDocumentToFolder;

  // The open folder's place in the pane, kept while the panel is drawn again on it; opening a folder starts at its
  // top (explorer-structure.md "Back").
  const placeKey = (folder: string | null) =>
    `panel:${section.kind}:${'id' in section ? section.id : ''}:${folder ?? 'root'}`;
  const openFolder = (id: string | null) => {
    memoryPlaces.forget(placeKey(id));
    onOpenFolder(id);
  };
  const value = { ...tree, defaultFolders, onOpenFolder: openFolder };
  // The panel's find (explorer-structure.md "Find"): every section that lists a space's documents.
  const root = useRef<HTMLDivElement>(null);
  const here = section.kind === 'mine' || section.kind === 'team' ? folderId : null;
  const scope = placeKey(here);
  const find = usePanelFind(root, section.kind !== 'tags', scope);
  const words = find.open ? find.text.split(/\s+/).filter(Boolean) : [];
  const query = compileTitleQuery(words);
  const finding = query.words.length > 0;
  const narrow = <T extends { name: string }>(items: readonly T[]): readonly T[] =>
    finding ? rankByTitle(items, query, (i) => i.name) : items;
  const place = { key: scope, store: memoryPlaces, restore: true };
  let body: React.ReactNode;
  if (section.kind === 'tags') {
    // Every document a tag can sit on: the reader's own (this browser's included) and their teams', newest first.
    const own = [...ownIndex.documentsByFolder.values()].flat();
    const byTeam = teams.flatMap((t) =>
      (documentsByTeam.get(t.id) ?? NO_DOCUMENTS).map((d): PaneDocument => ({ ...d, team: t })),
    );
    // By id: a browser document filed in a folder is in both of the first two lists.
    const docs = [
      ...new Map([...own, ...offlineDocuments, ...byTeam].map((d) => [d.id, d])).values(),
    ].sort((a, b) => b.savedAt - a.savedAt);
    body = <PanelTagsSection documents={docs} />;
  } else if (section.kind === 'browser' || section.kind === 'shared') {
    const docs: PaneDocument[] =
      section.kind === 'browser' ? offlineDocuments : shared.map(sharedToPaneDocument);
    const shown = narrow(docs);
    body = docs.length ? (
      <div className="flex flex-col gap-1">
        {find.open ? (
          <PanelFindField
            find={find}
            folderName={rootLabel}
            matches={finding ? shown.length : null}
          />
        ) : null}
        <WindowedPaneList
          label={rootLabel}
          items={shown}
          scope={scope}
          place={place}
          renderItem={(d) => <PanelDocumentItem key={d.id} document={d} />}
        />
      </div>
    ) : (
      <EmptyPane compact selected={{ kind: section.kind === 'browser' ? 'offline' : 'shared' }} />
    );
  } else {
    const index = section.kind === 'team' ? teamIndex : ownIndex;
    const byId = new Map([...index.foldersByParent.values()].flat().map((f) => [f.id, f]));
    // A folder deleted (or moved away) while open: back to the root.
    const shownHere = paneFolderParent(byId.values(), folderId);
    const trail: PanelFolder[] = [];
    for (
      let f = shownHere ? byId.get(shownHere) : undefined;
      f;
      f = f.parentId ? byId.get(f.parentId) : undefined
    )
      trail.unshift(f);
    const allFolders = index.foldersByParent.get(shownHere) ?? [];
    const allDocs = index.documentsByFolder.get(shownHere) ?? [];
    const folders = narrow(allFolders);
    const docs = narrow(allDocs);
    const folderName = trail.at(-1)?.name ?? rootLabel;
    const empty: SelectedNode = shownHere ? { kind: 'folder', id: shownHere } : { kind: 'all' };
    body = (
      <div className="flex flex-col gap-1">
        {/* The import and export screens' back bar: back to the folder above (or the space's root), the folder open
            here as its chip. */}
        {trail.length ? (
          <BackBar
            gap="tight"
            label={trail.at(-2)?.name ?? rootLabel}
            current={trail.at(-1)!.name}
            onClick={() => openFolder(trail.at(-2)?.id ?? null)}
          />
        ) : null}
        {find.open ? (
          <PanelFindField
            find={find}
            folderName={folderName}
            matches={finding ? folders.length + docs.length : null}
          />
        ) : null}
        {folders.length + docs.length ? (
          // Keyed by the folder open, so opening one slides its contents in.
          <div key={shownHere ?? 'root'} className="flex animate-view-forward flex-col gap-3">
            {folders.length ? (
              <PaneGrid label={`Folders in ${folderName}`}>
                {folders.map((f) => (
                  <PanelFolderItem key={f.id} folder={f} index={index} team={team} />
                ))}
              </PaneGrid>
            ) : null}
            {docs.length ? (
              <WindowedPaneList
                label={folderName}
                items={docs}
                scope={scope}
                place={place}
                renderItem={(d) => (
                  <PanelDocumentItem
                    key={d.id}
                    document={team ? { ...d, team } : d}
                    draggable={!team && draggable}
                  />
                )}
              />
            ) : null}
          </div>
        ) : finding ? null : (
          <EmptyPane compact cta={false} selected={empty} />
        )}
      </div>
    );
  }
  return (
    <PanelTreeProvider value={value}>
      <TitleHighlightProvider text={words}>
        <div ref={root} className="contents">
          {busy && section.kind !== 'shared' ? <PaneSkeleton /> : body}
        </div>
      </TitleHighlightProvider>
    </PanelTreeProvider>
  );
}
