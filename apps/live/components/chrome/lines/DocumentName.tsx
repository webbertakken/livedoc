'use client';

import { useState, type ReactNode } from 'react';
import { HoverCard } from '@livedoc/ui';
import { NameEditor } from '@/components/primitives/NameEditor';
import { SharedBadge } from '@/components/chrome/SharedBadge';

export type DocumentNameProps = {
  documentName: string;
  // The owner or a team member may manage sharing (canShareDocument): the share-state icon opens Share for them.
  showShare: boolean;
  shareable: boolean;
  // A team's shared library (docs/specs/013-workspace/team-shared-documents.md): "Team" while it has no share links.
  teamDocument?: boolean;
  // Saved only in this browser (docs/specs/006-document/offline-mode.md): "This Browser".
  offline?: boolean;
  onOpenShare: () => void;
  onRename: (name: string) => void;
  // The session may not rename the document (a Viewer, a Participant): the name is text.
  readOnly?: boolean;
  // Bumped by the command palette's Rename Document: each bump opens the rename once, never on mount.
  renameNonce?: number;
  // The role pill (docs/specs/007-editor/live-app.md#role-pill), or Minimal chrome's status icon.
  rolePill?: ReactNode;
};

// The document group's start (docs/specs/007-editor/toolbar-layout.md "The bottom line"; live-app.md "The top bar's
// middle"): the share-state icon, the name (click to rename, for someone who may) and the role pill. The name shortens
// with an ellipsis to the room the line leaves it (`--doc-name-max`, useLineRoom), never under 72px, and is not drawn
// on a phone; the icon never shrinks.
export function DocumentName({
  documentName,
  showShare,
  shareable,
  teamDocument = false,
  offline = false,
  onOpenShare,
  onRename,
  readOnly = false,
  renameNonce = 0,
  rolePill,
}: DocumentNameProps) {
  const [editing, setEditing] = useState(false);
  // Each request is honoured once; the mount value is never a request.
  const [handledNonce, setHandledNonce] = useState(renameNonce);
  if (renameNonce !== handledNonce) {
    setHandledNonce(renameNonce);
    if (!readOnly) setEditing(true);
  }
  const renaming = editing && !readOnly;
  return (
    <div data-title-bar-middle="" className="flex min-w-0 items-center gap-2 pl-0.5">
      <SharedBadge
        look="icon"
        shareable={shareable}
        team={teamDocument}
        offline={offline}
        onManage={showShare ? onOpenShare : undefined}
      />
      {/* Its own box: a rename ended from the keyboard hands focus to the first control here, the name
          (refocus-after-field), never the icon. */}
      <span
        data-doc-name=""
        className="flex min-w-[72px] max-w-[var(--doc-name-max,20rem)] phone:hidden"
      >
        {renaming ? (
          <NameEditor
            initial={documentName}
            onCommit={(v) => {
              onRename(v.trim() || documentName);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
            className="w-full rounded-control border border-slate-300 bg-white px-2 py-0.5 text-body text-slate-800 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        ) : readOnly ? (
          <span className="truncate px-1 text-body text-slate-700 dark:text-slate-200">
            {documentName}
          </span>
        ) : (
          <HoverCard
            title="Rename document"
            description="Click to edit the name."
            className="min-w-0"
          >
            <button
              type="button"
              onClick={() => setEditing(true)}
              // 44px tall on a touch screen; padding, not a pad, since `truncate` clips a ::before.
              className="w-full truncate rounded-control px-2 py-1 text-left text-body text-slate-700 transition pointer-coarse:py-3 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {documentName}
            </button>
          </HoverCard>
        )}
      </span>
      {rolePill && !renaming ? <span className="inline-flex shrink-0">{rolePill}</span> : null}
    </div>
  );
}
