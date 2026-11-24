'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import type { ElementId } from '@livedoc/document';
import type { StormGap, StormReading } from '@livedoc/storm-reading';
import { REVIEW_TABS, type ReviewTab } from '@/lib/review-view';
import { ReviewCheck } from './ReviewCheck';
import { ReviewLanguage, type TermRenameAsk } from './ReviewLanguage';
import { ReviewStory } from './ReviewStory';

// The Review panel's three tabs (docs/specs/021-event-storming/board-review.md "The panel"), following the WAI-ARIA
// tabs pattern: Check, Language and Story, one shown at a time. Arrow keys, Home and End move between the tabs and
// show the one they land on. It reads the board as it is and says nothing of where it stands: its shell does.

const TAB_NAMES: Record<ReviewTab, string> = {
  check: 'Check',
  language: 'Language',
  story: 'Story',
};

export type ReviewPanelActs = {
  // Ring these notes on the board and bring them into view, dimming the rest when asked; none lets go.
  ring: (ids: readonly ElementId[], dim?: boolean) => void;
  add: (gap: StormGap) => void;
  answer: (hotspotId: ElementId) => void;
  previewRename: (ask: TermRenameAsk | null) => void;
  renameWouldChange: (ask: TermRenameAsk) => boolean;
  rename: (ask: TermRenameAsk) => void;
  storyWalked: () => void;
};

export function ReviewPanel({
  tab,
  reading,
  mayWrite,
  onTab,
  acts,
}: {
  tab: ReviewTab;
  reading: StormReading;
  // Whether Add, Answer and Rename Term are offered: an Editor's alone.
  mayWrite: boolean;
  onTab: (tab: ReviewTab) => void;
  acts: ReviewPanelActs;
}) {
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const tabId = (t: ReviewTab) => `${id}-tab-${t}`;
  const panelId = `${id}-panel`;
  const onKeyDown = (e: KeyboardEvent) => {
    const at = REVIEW_TABS.indexOf(tab);
    const to =
      e.key === 'ArrowRight'
        ? (at + 1) % REVIEW_TABS.length
        : e.key === 'ArrowLeft'
          ? (at + REVIEW_TABS.length - 1) % REVIEW_TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? REVIEW_TABS.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = REVIEW_TABS[to]!;
    onTab(next);
    tabs.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(next))}`)?.focus();
  };
  return (
    <>
      <div
        ref={tabs}
        role="tablist"
        aria-label="Review"
        onKeyDown={onKeyDown}
        className="flex shrink-0 gap-0.5 border-b border-slate-200 px-2 pt-1.5 dark:border-slate-800"
      >
        {REVIEW_TABS.map((t) => (
          <button
            key={t}
            id={tabId(t)}
            type="button"
            role="tab"
            aria-selected={t === tab}
            aria-controls={panelId}
            tabIndex={t === tab ? 0 : -1}
            onClick={() => onTab(t)}
            className={`-mb-px rounded-t-control border-b-2 px-3 pb-2 pt-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
              t === tab
                ? 'border-brand-600 text-slate-900 dark:border-brand-300 dark:text-slate-100'
                : 'border-transparent font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span className="text-optical-centre">{TAB_NAMES[t]}</span>
          </button>
        ))}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'check' ? (
          <ReviewCheck
            reading={reading}
            mayWrite={mayWrite}
            onRing={acts.ring}
            onAdd={acts.add}
            onAnswer={acts.answer}
          />
        ) : tab === 'language' ? (
          <ReviewLanguage
            reading={reading}
            mayWrite={mayWrite}
            onRing={acts.ring}
            onPreview={acts.previewRename}
            wouldChange={acts.renameWouldChange}
            onRename={acts.rename}
          />
        ) : (
          <ReviewStory reading={reading} onRing={acts.ring} onWalked={acts.storyWalked} />
        )}
      </div>
    </>
  );
}
