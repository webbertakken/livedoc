'use client';

import { useOptionalEditorContext } from '@/app/document/[id]/EditorContext';
import type { PendingCreateView } from '@/app/document/[id]/usePendingCreate';
import { TopCenterBanner, TopCenterRow } from './TopCenter';

// The not-saved notice (docs/specs/013-workspace/new-document-menu.md "Opening at once"): a
// document made from the Explorer whose create failed stays open with everything done to it, and says so here, first
// in the top-centre stack, with the one action that can save it.
export function NotSavedBanner() {
  const pending = useOptionalEditorContext()?.pendingCreate ?? null;
  return pending ? <NotSavedNotice pending={pending} /> : null;
}

export function NotSavedNotice({ pending }: { pending: PendingCreateView }) {
  const { failure } = pending;
  if (!failure) return null;
  const elsewhere = failure.action === 'choose';
  return (
    <TopCenterRow>
      <TopCenterBanner tone="neutral" className="gap-2 px-3 py-1 text-[11px] font-medium">
        <span role="alert" className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <span>
            <span className="font-semibold">Not saved yet.</span> {failure.message}
          </span>
        </span>
        <button
          type="button"
          onClick={elsewhere ? pending.saveToMyDocuments : pending.retry}
          className="cursor-pointer rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] font-semibold transition hover:bg-slate-900/20 focus-visible:outline-2 focus-visible:outline-brand-500 dark:bg-white/15 dark:hover:bg-white/25"
        >
          {elsewhere ? 'Save to My Documents' : 'Try again'}
        </button>
      </TopCenterBanner>
    </TopCenterRow>
  );
}
