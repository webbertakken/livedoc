'use client';

import { useState, type ComponentProps } from 'react';
import { folderNamesInDocument, tabFolderName, type Tab } from '@livedoc/document';
import type { AccessLevel } from '@livedoc/api-schema';
import { hasPlanContent } from '@/hooks/plan/usePlanNeeded';
import { tabDeletion } from '@/lib/tab-deletion';
import { track } from '@/lib/telemetry';
import { useAppearance } from '@/hooks/ui/useAppearance';
import type { Participant } from '@/lib/identity';
import type { EllipsisMenuButton } from '@/components/chrome/EllipsisMenuButton';
import type { AddTabChoice } from '@/lib/new-tab-seed';
import { tabDataRows } from '@/components/chrome/tab-data-rows';
import { useTabReorderDrag } from '@/components/chrome/useTabReorderDrag';

// Canvas-scoped actions folded into the unified tab / canvas menu: Paste straight from the empty-canvas right-click
// (docs/specs/008-canvas/canvas-and-palette.md), greyed, not hidden, when the buffer is empty.
export type CanvasMenuActions = {
  onPaste: () => void;
  canPaste: boolean;
};

// Where the canvas right-click menu opens. `openUp` grows it upward from y rather than down from the cursor.
export type CanvasMenuTarget = { x: number; y: number; openUp?: boolean };

// What the document group needs of the document's tabs (docs/specs/007-editor/toolbar-layout.md "The bottom line",
// "The tab list"): the tabs and every tab action the tab bar had, so nothing it did is lost.
export type TabsChromeProps = {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  // The add menu's choice (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab").
  onAdd: (choice: AddTabChoice) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  // The document's last tab deletes the document (docs/specs/006-document/document-structure.md "The last tab"),
  // only for a session that may delete it, asking first when the tab holds content or has not loaded.
  canDeleteDocument: boolean;
  onDeleteDocument: () => void;
  isTabLoaded: (tabId: string) => boolean;
  // Folder membership (docs/specs/006-document/tab-folders.md): a tab into a folder by name (new or existing), out
  // of its folder, or a folder renamed (every member rewritten).
  onMoveTabToFolder: (tabId: string, folderName: string) => void;
  onRemoveTabFromFolder: (tabId: string) => void;
  onRenameFolder: (oldName: string, newName: string) => void;
  // Enables the tab menu's Clear Content; disabled on an empty tab so it stays discoverable without no-oping.
  activeTabHasContent: boolean;
  onClearContent: () => void;
  onImportTab: () => void;
  onExportTab: () => void;
  // The person's other documents, for the tab menu's Add to Document (savedAt versions the thumbnails).
  otherDocuments: { id: string; name: string; savedAt?: number }[];
  onCopyTabTo: (targetDocumentId: string) => Promise<void> | void;
  onToggleLockTab: () => void;
  // Move `sourceId` next to `targetId`, before it unless `placeBefore` is false.
  onReorder: (sourceId: string, targetId: string, placeBefore?: boolean) => void;
  // The session may not change the document's tabs (a Participant, a Viewer, a tab-scoped visitor): no rename, no
  // add, no tab menu, no drag. Rows still switch.
  readOnly?: boolean;
  // Tabs outside a tab-scoped share session's scope (docs/specs/013-workspace/tab-scoped-share-links.md).
  isOutOfScope?: (tabId: string) => boolean;
  // Bumped by the command palette's Rename Tab: each bump opens the active tab's rename once.
  renameActiveNonce?: number;
  // Who is on which tab, and the local person, for each row's presence stack.
  participantsByTab: Map<string, Participant[]>;
  selfId: string;
  selfRole: AccessLevel;
  followingId?: string | null;
  followerCount?: number;
  onOpenCollaborators?: (participantId: string | null) => void;
  // The canvas right-click menu: the active tab's menu with the canvas sections folded in, open while set.
  canvasMenu?: CanvasMenuTarget | null;
  onCloseCanvasMenu?: () => void;
  canvasActions?: CanvasMenuActions;
};

export type TabMenuProps = Omit<
  ComponentProps<typeof EllipsisMenuButton>,
  'open' | 'onToggle' | 'onClose' | 'canvas'
>;

// The state the document group's tab controls share: which tab's menu is open, which tab is being renamed, the
// drag-reorder machinery, and the tab-menu callbacks for a tab (shared by the active tab's ⋯, the tab list's rows
// and the canvas right-click, so all three drive exactly the same actions). `close` differs per surface.
export function useTabsChrome(props: TabsChromeProps) {
  const { tabs, activeId, readOnly = false, renameActiveNonce = 0 } = props;
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Each bump of the command palette's nonce opens the rename once, during render; the mount value is no request,
  // so a remount never replays one. Ignored where the session may not rename.
  const [seenRenameNonce, setSeenRenameNonce] = useState(renameActiveNonce);
  if (renameActiveNonce !== seenRenameNonce) {
    setSeenRenameNonce(renameActiveNonce);
    if (!readOnly) setEditingId(activeId);
  }
  const reorderDrag = useTabReorderDrag(props.onReorder);
  // The accent's legibility guard reads the chrome's scheme: a stroke that reads on one can vanish on the other.
  const isDark = useAppearance().appearance === 'dark';
  const folderNames = folderNamesInDocument(tabs);

  const tabMenuProps = (tab: Tab, close: () => void): TabMenuProps => {
    // Deleting a board or sheet a form sends to unpublishes the form, and a last tab takes its document: what the
    // menu's Delete does, and asks first, is tabDeletion's.
    const deletion = tabDeletion({
      tabs,
      tabId: tab.id,
      canDeleteDocument: props.canDeleteDocument,
      isTabLoaded: props.isTabLoaded,
    });
    return {
      deletion,
      canClearContent: props.activeTabHasContent && !tab.locked,
      locked: tab.locked === true,
      // A Plan tab's cards are its document's items: it is not added to another document
      // (docs/specs/026-plan/plan-mode.md "Switching modes keeps the tab").
      planTab: hasPlanContent(tab.elements, null),
      dataRows: tabDataRows(tab),
      selfId: props.selfId,
      otherDocuments: props.otherDocuments,
      folderNames,
      currentFolder: tabFolderName(tab),
      onMoveToFolder: (name: string) => {
        props.onMoveTabToFolder(tab.id, name);
        close();
      },
      onRemoveFromFolder: () => {
        props.onRemoveTabFromFolder(tab.id);
        close();
      },
      onRename: () => {
        setEditingId(tab.id);
        close();
      },
      onDuplicate: () => {
        props.onDuplicate(tab.id);
        close();
      },
      onClearContent: () => {
        props.onClearContent();
        close();
      },
      onImport: () => {
        props.onImportTab();
        close();
      },
      onExport: () => {
        props.onExportTab();
        close();
      },
      // Closes once the copy lands; a failed copy keeps the menu open (the callee reports it).
      onCopyTo: (targetId: string) => {
        void Promise.resolve(props.onCopyTabTo(targetId)).then(close, (error: unknown) =>
          console.warn('[tab-menu] add to document failed', error),
        );
      },
      onToggleLock: () => {
        props.onToggleLockTab();
        close();
      },
      onDelete: () => {
        if (deletion.kind === 'blocked') return;
        if (deletion.kind === 'document') {
          track('Tab', 'Deleted', 'LastTab');
          props.onDeleteDocument();
        } else {
          props.onDelete(tab.id);
        }
        close();
      },
    };
  };

  return {
    menuFor,
    setMenuFor,
    editingId,
    setEditingId,
    reorderDrag,
    isDark,
    tabMenuProps,
    activeTab: tabs.find((t) => t.id === activeId),
  };
}

export type TabsChrome = ReturnType<typeof useTabsChrome>;
