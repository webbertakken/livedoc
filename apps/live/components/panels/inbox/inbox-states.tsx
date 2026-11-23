'use client';

// The Inbox's whole-page states and its document chip (docs/specs/013-workspace/inbox.md §1.2, "States"): nothing
// outstanding, a failed read, and which document a row is from.

import { EmptyState, SOLID_BRAND_DARK_CONTROL } from '@livedoc/ui';
import { InboxIcon, TeamIcon } from '@/components/primitives/explorer-icons';
import { ThisBrowserPill } from '@/components/primitives/ThisBrowserPill';
import { helpArticleHref } from '@/lib/help-articles';
import type { InboxFacts } from './inbox-entries';

const CTA = `inline-flex min-h-prominent items-center gap-1 rounded-control bg-brand-700 px-4 py-2 text-body font-medium text-white shadow-sm transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${SOLID_BRAND_DARK_CONTROL}`;

// Which document the row is from; a team document's chip leads with the team glyph. A document in This Browser is
// followed by the This Browser pill, as a label: the row is one option, not a set of links
// (docs/specs/006-document/offline-mode.md#this-browser-pill).
export function InboxDocumentChip({ document, local }: Pick<InboxFacts, 'document' | 'local'>) {
  return (
    <>
      <span className="inline-flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        {document.via === 'team' ? (
          <span aria-hidden className="text-slate-500 dark:text-slate-400">
            <TeamIcon />
          </span>
        ) : null}
        <span className="truncate">{document.name}</span>
      </span>
      {local ? <ThisBrowserPill asLabel tabbable={false} /> : null}
    </>
  );
}

// Nothing outstanding anywhere. No New Document CTA: a new document puts nothing here; assigning an action or
// commenting does.
export function InboxEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <EmptyState
      compact={compact}
      icon={<InboxIcon />}
      title="Nothing waiting on you"
      description="Open actions and Plan cards assigned to you, actions you assigned, comment threads you're in and new form responses collect here across every document."
    >
      <a
        href={helpArticleHref('assignedActions')}
        target="_blank"
        rel="noreferrer noopener"
        className={CTA}
      >
        How actions work
      </a>
    </EmptyState>
  );
}

// The read failed, which is NOT "nothing outstanding".
export function InboxFailedState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-surface border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <p className="text-body text-slate-600 dark:text-slate-300">Couldn&apos;t load your Inbox</p>
      <p className="mt-1 text-supporting text-slate-500 dark:text-slate-400">
        Check your connection and try again.
      </p>
      <button type="button" onClick={onRetry} className={`mt-3 ${CTA}`}>
        Try again
      </button>
    </div>
  );
}
