'use client';

import { useMemo } from 'react';
import { documentEntryPropsFor, type ExplorerViewProps } from '@/app/explorer/explorer-view-props';
import { LIST_CARD } from '@/components/primitives/surface-classes';
import { DETAILS_COLUMNS, sortDetailsEntries } from './details-columns';
import { useWindowedList } from '@/components/primitives/windowed-list/useWindowedList';
import { WindowGap, windowChildren } from '@/components/primitives/windowed-list/WindowGap';
import { useEntryKeys } from '../explorer-entry-keys';
import { useExplorerListPlace } from '../useExplorerListPlace';

// A Details row's height before one is measured.
const DETAILS_ROW_STRIDE_PX = 41;
import { DetailsDocumentRow } from './DetailsDocumentRow';
import { DetailsFolderRow } from './DetailsFolderRow';
import { DetailsHeader } from './DetailsHeader';
import { useDetailsSort } from './useDetailsSort';

// The Explorer's Details view (docs/specs/013-workspace/explorer-details-view.md): the same folders
// and documents the list and cards show, as one flat table sorted by any column, folders first.
// Takes the same props as ListView and CardView, so ExplorerPane swaps the three on the toggle.
export function DetailsView(props: ExplorerViewProps) {
  const {
    folders,
    documents,
    onOpenFolder,
    onCommitRenameFolder,
    onCancelRenameFolder,
    renamingFolderId,
    folderActions,
    childrenCount,
    documentsCount,
  } = props;
  const [sort, sortBy] = useDetailsSort();
  const sorted = useMemo(
    () =>
      sortDetailsEntries({
        folders,
        documents,
        sort,
        itemCount: (id) => childrenCount(id) + documentsCount(id),
      }),
    [folders, documents, sort, childrenCount, documentsCount],
  );
  // Long folders draw only the rows near the view (explorer-structure.md "Long lists"); the header is row 1.
  const { attachList, segments, cascading, onFocus, onDragStart } = useWindowedList({
    keys: useEntryKeys(sorted.folders, sorted.documents),
    leading: sorted.folders.length,
    estimateStride: DETAILS_ROW_STRIDE_PX,
    aria: { kind: 'table', rowOffset: 1 },
    ...useExplorerListPlace(props.listKey),
  });
  return (
    <div className={`${LIST_CARD} overflow-x-auto`}>
      <table
        className="w-full table-fixed border-collapse"
        aria-label="Folders and documents"
        aria-rowcount={sorted.folders.length + sorted.documents.length + 1}
      >
        <DetailsHeader sort={sort} onSort={sortBy} />
        <tbody
          ref={attachList}
          onFocus={onFocus}
          onDragStart={onDragStart}
          className={`${cascading ? 'lvd-cascade ' : ''}divide-y divide-slate-100 dark:divide-slate-700/60`}
        >
          {windowChildren(
            segments,
            (i) => {
              const f = sorted.folders[i];
              if (f)
                return (
                  <DetailsFolderRow
                    key={f.id}
                    folder={f}
                    itemCount={childrenCount(f.id) + documentsCount(f.id)}
                    renaming={renamingFolderId === f.id}
                    onOpen={() => onOpenFolder(f.id)}
                    onCommitRename={(name) => onCommitRenameFolder(f.id, name)}
                    onCancelRename={onCancelRenameFolder}
                    getActions={(anchor) => folderActions(f, anchor)}
                  />
                );
              const d = sorted.documents[i - sorted.folders.length]!;
              return <DetailsDocumentRow key={d.id} {...documentEntryPropsFor(props, d)} />;
            },
            (height) => (
              <WindowGap as="tr" height={height} columns={DETAILS_COLUMNS.length + 1} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
