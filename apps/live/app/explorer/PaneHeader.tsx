'use client';

// The Explorer pane header (docs/specs/013-workspace/folders.md): title + breadcrumb on the left, and on
// the right a section "?" help button, any section-specific actions slot, and
// the New Document menu (new-document/NewDocumentButton.tsx), New Folder inside it. Split out of views.tsx
// so that barrel holds the list/row primitives while the header chrome (and
// its private hamburger / caret icons) stands on its own.
import { PlusIcon } from '@/components/primitives/explorer-icons';
import { Button, Glyph } from '@livedoc/ui';
import type { ReactNode } from 'react';
import { HelpArticleLink } from '@/components/primitives/HelpArticleLink';
import type { HelpArticleKey } from '@/lib/help-articles';
import { NewDocumentButton } from './new-document/NewDocumentButton';
import type { NewDocumentRequest } from './new-document/start-new-document';
import { paneCreateMode } from './pane-create-action';
import { ViewToggle } from './ViewToggle';
import type { ExplorerViewMode } from './useExplorerViewMode';

// Shared with Home's hero, which stands in for this header on Home.
export function HamburgerIcon() {
  return (
    <Glyph size={18} units={18} strokeLinejoin="miter">
      <path d="M3 5h12M3 9h12M3 13h12" />
    </Glyph>
  );
}

export function PaneHeader({
  title,
  crumbs,
  newDocumentPlace,
  onCreateFolder,
  folderLabel,
  onOpenNav,
  helpArticle,
  headerActions,
  viewMode,
  onSetViewMode,
}: {
  title: string;
  crumbs: { name: string; onClick?: () => void }[];
  // Section-scoped Help button, rendered to the left of Create (or alone
  // when the section has no Create action). Deep-links the matching
  // help-centre article (docs/specs/018-help/contextual-help-links.md) for this Explorer section; its hover card
  // copy comes from HELP_LINK_COPY.
  helpArticle?: HelpArticleKey;
  // Mobile only: opens the section drawer (the sidebar is hidden below
  // `sm`). Renders a hamburger to the left of the title. Omitted on
  // desktop where the sidebar is always visible.
  onOpenNav?: () => void;
  // Optional CTAs rendered in the title row's right edge. Replaces
  // the standalone floating "+" FAB so the actions sit in their
  // current context rather than as a global affordance. A section offering New Document passes where a new document
  // goes (its folder, or nowhere in particular); the New Document menu shows, New Folder / New Subfolder in it (the
  // label varies by selection, so the caller passes it). Both are optional: the Shared / Gallery views pass neither
  // because the verbs don't apply.
  newDocumentPlace?: NewDocumentRequest['place'];
  onCreateFolder?: () => void;
  // "New folder" at the root level, "New subfolder" inside an
  // existing folder. Caller resolves the wording.
  folderLabel?: string;
  // Extra section-specific action(s) rendered in the actions row, just to the
  // right of the help "?" button (e.g. the API tokens "New token" popover
  // button, docs/specs/015-api/public-api-and-tokens.md). Lets a section add a header CTA without going through
  // the document/folder Create dropdown.
  headerActions?: ReactNode;
  // List/Card/Details toggle (docs/specs/006-document/document-snapshots.md), shown in the actions row left of
  // Help and Create on the browse views that can render either layout. Both must be
  // present for the toggle to appear; sections that only list one way
  // (gallery, tokens, …) omit them.
  viewMode?: ExplorerViewMode;
  onSetViewMode?: (mode: ExplorerViewMode) => void;
}) {
  // A single-item breadcrumb is just the page title in a second
  // place: visually noisy and provides no navigation. Show only
  // when there are actual parents to click back to.
  const showCrumbs = crumbs.length >= 2;
  const showViewToggle = Boolean(viewMode && onSetViewMode);
  // The New Document menu wherever New Document is offered, New Folder inside it; a lone New Folder as itself
  // (pane-create-action.ts).
  const createMode = paneCreateMode({
    hasCreateDocument: Boolean(newDocumentPlace),
    hasCreateFolder: Boolean(onCreateFolder),
  });
  const hasCreate = createMode.kind !== 'none';
  const hasActions = hasCreate || Boolean(helpArticle) || Boolean(headerActions) || showViewToggle;
  return (
    <div className="mb-4">
      {/* Wraps on a phone: the actions take a second line rather than squeezing the title to
          nothing. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-[10rem] flex-1 items-center gap-2">
          {onOpenNav ? (
            <button
              type="button"
              onClick={onOpenNav}
              aria-label="Browse sections"
              className="-ml-1 flex size-row shrink-0 items-center justify-center rounded-control text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:hidden"
            >
              <HamburgerIcon />
            </button>
          ) : null}
          {title ? (
            <h1 className="min-w-0 truncate text-page-title text-slate-900 dark:text-slate-100">
              {title}
            </h1>
          ) : null}
        </div>
        {hasActions ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {/* Wraps too when the actions alone outrun the pane (Timeline's at a tablet's width), ending flush
                right. */}
            {/* Section actions first, then the view toggle, then Help and Create. Help is the
                least-used control in the row and belongs at its quiet end; leading
                with it pushed the controls a reader actually reaches for
                out to the right. Help and Create always sit right of the toggle. */}
            {headerActions}
            {showViewToggle ? <ViewToggle mode={viewMode!} onChange={onSetViewMode!} /> : null}
            {helpArticle ? <HelpArticleLink article={helpArticle} variant="button" /> : null}
            {createMode.kind === 'new-document' ? (
              <NewDocumentButton
                place={newDocumentPlace!}
                onCreateFolder={onCreateFolder}
                folderLabel={folderLabel}
              />
            ) : null}
            {createMode.kind === 'new-folder' ? (
              <Button
                size="xs"
                onClick={onCreateFolder}
                aria-label={folderLabel ?? 'New Folder'}
                className="shadow-sm"
              >
                <PlusIcon />
                {/* Label collapses to the icon below `sm:`, so the header row never wraps on a phone. */}
                <span className="hidden sm:inline">{folderLabel ?? 'New Folder'}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {showCrumbs ? (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center rounded-control border border-slate-200 bg-white px-2 py-1 text-body text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={`${c.name}-${i}`} className="flex items-center">
                {i > 0 ? (
                  <span aria-hidden className="px-1 text-slate-300 dark:text-slate-600">
                    ›
                  </span>
                ) : null}
                {c.onClick && !isLast ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    // A 20px crumb: padded to a finger's 44px on a touch screen, upward and downward only, so the
                    // crumbs beside it keep their own taps.
                    className="relative touch-target-y rounded-control px-1 py-0.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    {c.name}
                  </button>
                ) : (
                  <span className="rounded-control px-1 py-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {c.name}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
