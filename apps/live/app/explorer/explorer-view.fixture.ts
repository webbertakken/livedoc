// Test fixtures for the Explorer's browse views (List, Cards, Details): a pane document, a folder, and the props a
// view takes, every callback a spy.

import { vi } from 'vitest';
import type { Folder } from '@/lib/api-client';
import type { ExplorerViewProps } from './explorer-view-props';
import type { PaneDocument } from './views';

export const paneDocument = (id: string, over: Partial<PaneDocument> = {}): PaneDocument => ({
  id,
  name: id,
  folderId: null,
  savedAt: 1,
  shareCode: null,
  ownerId: 'me',
  // Empty, so no thumbnail is fetched.
  empty: true,
  ...over,
});

export const projectsFolder: Folder = {
  id: 'f1',
  name: 'Projects',
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  teamId: null,
} as Folder;

export function viewProps(documents: PaneDocument[], folders: Folder[] = []): ExplorerViewProps {
  return {
    folders,
    documents,
    ownerId: 'me',
    onOpenFolder: vi.fn(),
    onCommitRenameFolder: vi.fn(),
    onCancelRenameFolder: vi.fn(),
    renamingFolderId: null,
    renamingDocumentId: null,
    onCommitRenameDocument: vi.fn(),
    onCancelRenameDocument: vi.fn(),
    folderActions: () => ({
      rename: vi.fn(),
      newSubfolder: vi.fn(),
      move: vi.fn(),
      delete: vi.fn(),
    }),
    onStartRenameDocument: vi.fn(),
    onDuplicateDocument: vi.fn(),
    onDeleteDocument: vi.fn(),
    onMoveDocument: vi.fn(),
    childrenCount: () => 1,
    documentsCount: () => 2,
  };
}
