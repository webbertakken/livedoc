'use client';

import { lucideGlyph, PrivateDotIcon, SharedDotIcon } from '@livedoc/ui';
import { lucideAppWindow, lucideLink, lucideLock, lucideUsers } from '@livedoc/icons/lucide';
import type { ReactNode } from 'react';
import { ThisBrowserIcon } from '@/components/primitives/explorer-icons';
import {
  THIS_BROWSER_DESCRIPTION,
  THIS_BROWSER_LABEL,
  THIS_BROWSER_TONE,
} from '@/components/primitives/ThisBrowserPill';

// A document's visibility states (docs/specs/006-document/offline-mode.md): their
// words and tones, shared by the pill beside the title (SharedBadge) and its legend (VisibilityLegend).

export type ShareState = 'private' | 'shared' | 'team' | 'offline';

// Per-state pill styling, keyed by the resolved share state so the label /
// description / badge + dot colours stay in one table rather than four
// parallel `state === ...` ternaries. Also drives the legend rows.
export const SHARE_STATE_META: Record<
  ShareState,
  { label: string; description: string; badge: string; dot: string }
> = {
  private: {
    label: 'Private',
    description: 'Only visible to you.',
    badge:
      'bg-slate-100 px-2 text-supporting text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
    dot: 'text-slate-400',
  },
  shared: {
    label: 'Shared',
    description: 'Anyone with a link can open it.',
    badge:
      'bg-emerald-50 px-2 text-supporting text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    dot: 'text-emerald-500',
  },
  team: {
    label: 'Team',
    description: 'In a team library: every member of the team can open it.',
    badge:
      'bg-brand-50 px-2 text-supporting text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
    dot: 'text-brand-700 dark:text-brand-400',
  },
  // Offline Mode (docs/specs/006-document/offline-mode.md): saved only in this browser, never on the
  // server. The This Browser pill's words, sentence and amber tone (text 4.5:1 on its fill, ring 3:1).
  offline: {
    label: THIS_BROWSER_LABEL,
    description: THIS_BROWSER_DESCRIPTION,
    badge: `px-2 text-supporting ${THIS_BROWSER_TONE}`,
    dot: '',
  },
};

// The pill's rendered height, pinned: its caps label is trimmed to cap height, so padding alone would
// shrink it (docs/specs/004-interface-design/optical-alignment.md).
export const STATE_CHIP_HEIGHT_PX = 24;

// The top bar's share-state icon (docs/specs/007-editor/live-app.md "The top bar's middle"): one glyph per state, drawn
// at 14 px on a 28 px round in the state's tone.
const STATE_GLYPHS: Record<ShareState, () => ReactNode> = {
  private: lucideGlyph(lucideLock, 14),
  shared: lucideGlyph(lucideLink, 14),
  team: lucideGlyph(lucideUsers, 14),
  offline: lucideGlyph(lucideAppWindow, 14),
};

/** The round's tone per state: a faint tint, its ink, and a hairline ring (4.5:1 ink on the tint). */
export const STATE_ICON_TONE: Record<ShareState, string> = {
  private:
    'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  shared:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  team: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  offline: THIS_BROWSER_TONE,
};

export function StateIcon({ state }: { state: ShareState }) {
  const Glyph = STATE_GLYPHS[state];
  return <Glyph />;
}

// The icon carries its colour itself: a wrapper would hide the svg from the chip's edge compensation.
export function StateDot({ state, className }: { state: ShareState; className: string }) {
  // The This Browser pill's own glyph: a browser window.
  if (state === 'offline') return <ThisBrowserIcon size={10} />;
  return state === 'private' ? (
    <PrivateDotIcon className={className} />
  ) : (
    <SharedDotIcon className={className} />
  );
}
