'use client';

import { memo } from 'react';
import dynamic from 'next/dynamic';
import type { TelemetrySummary, TelemetryWindowKey } from '@livedoc/api-schema';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DashboardView } from './DashboardView';
import type { SectionFocus } from './SectionedView';
import type { SectionKey, ViewKey } from './view-keys';

// The tab below the tab row (docs/specs/017-telemetry/telemetry.md). Only the Dashboard shows on
// arrival, so only it ships with the page. Every other view (each with its catalogue of event
// names and explanations) loads on its own, fetched while the browser is idle once the summary is
// in, so switching to one is still instant.
const VIEW_LOADERS = {
  features: () => import('./FeaturesView').then((m) => m.FeaturesView),
  pages: () => import('./PagesHelpView').then((m) => m.PagesHelpView),
  health: () => import('./HealthView').then((m) => m.HealthView),
  search: () => import('./MetricSearch').then((m) => m.MetricSearch),
};
// While a view's code downloads, its skeleton holds the tab's place (without one, `dynamic` draws nothing). Each
// call spells its options out: next/dynamic takes only an object literal.
const ViewSkeleton = () => <DashboardSkeleton variant="view" />;
const FeaturesView = dynamic(VIEW_LOADERS.features, { ssr: false, loading: ViewSkeleton });
const PagesHelpView = dynamic(VIEW_LOADERS.pages, { ssr: false, loading: ViewSkeleton });
const HealthView = dynamic(VIEW_LOADERS.health, { ssr: false, loading: ViewSkeleton });
const MetricSearch = dynamic(VIEW_LOADERS.search, { ssr: false, loading: ViewSkeleton });

// The browser's Save-Data setting (Network Information API; absent in some browsers, which then do not ask).
const savesData = (): boolean =>
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

// Fetch every other view's code once the page is idle (a timeout where requestIdleCallback is missing). A browser
// that asks to save data fetches nothing ahead: each view loads when opened, behind its skeleton.
export function prefetchViews(): () => void {
  if (savesData()) return () => {};
  const run = () => {
    for (const load of Object.values(VIEW_LOADERS)) void load().catch(() => {});
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1000);
  return () => window.clearTimeout(id);
}

// Memoised so the page can hand it a DEFERRED window: a click on a timeframe re-renders the
// selector at once and leaves this tree alone, then React re-renders it in the background,
// interruptibly. A sectioned tab holds what were five tabs (Features: ~7,700 nodes), and redrawing
// every card inside the click held the next paint for ~190 ms. Every prop must stay stable between
// window changes (`onOpenSection` is a useCallback) or the memo does nothing.
export const ActiveView = memo(function ActiveView({
  view,
  summary,
  active,
  focus,
  onOpenSection,
}: {
  view: ViewKey;
  summary: TelemetrySummary;
  active: TelemetryWindowKey;
  focus: SectionFocus | null;
  onOpenSection: (section: SectionKey) => void;
}) {
  switch (view) {
    case 'dashboard':
      return <DashboardView summary={summary} active={active} onOpenSection={onOpenSection} />;
    case 'features':
      return <FeaturesView summary={summary} active={active} focus={focus} />;
    case 'pages':
      return <PagesHelpView summary={summary} active={active} focus={focus} />;
    case 'health':
      return <HealthView summary={summary} active={active} focus={focus} />;
    case 'search':
      return summary.daily ? (
        <div className="mt-8">
          <MetricSearch windows={summary.windows} daily={summary.daily} active={active} />
        </div>
      ) : (
        <p className="mt-8 text-slate-500 dark:text-slate-400">
          Per-metric trends aren&rsquo;t available from this API version.
        </p>
      );
  }
});
