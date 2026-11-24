import { WINDOW_META } from './windows';

// What the dashboard shows while its numbers load (docs/specs/017-telemetry/telemetry.md "Dashboard app"): the
// shapes the data will take, in the layout it will take, so the page never empties and nothing above the cards moves
// when the data lands. Static markup: no state, no effects, no requests. The pulse stops under reduced motion.
//
// `page`: the whole dashboard before the summary answers (WindowPanel, ViewTabs, the Dashboard tab's first groups).
// `view`: a Detail tab's place while its code downloads (its groups of cards alone).

const PULSE = 'animate-pulse bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-700/60';
const CARD =
  'rounded-surface border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
// MetricCards' grid.
const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';
// ViewTabs' bar.
const BAR =
  'flex items-center gap-1 rounded-surface border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900';

// A placeholder for one line of text: the block keeps the text's line height (its `text` classes), so the skeleton
// stands exactly as tall as the words it stands in for.
function Bone({
  text,
  width,
  className = '',
}: {
  text: string;
  width: string;
  className?: string;
}) {
  return (
    <span className={`block ${text} ${className}`}>
      <span
        className={`inline-block h-[0.7em] max-w-full rounded-control align-middle ${width} ${PULSE}`}
      />
    </span>
  );
}

// WindowPanel's shape: the three window tiles, then the 30-day trend chart.
function WindowPanelSkeleton() {
  return (
    <div className={`${CARD} p-6`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {WINDOW_META.map((w) => (
          <div
            key={w.key}
            data-skeleton="window-tile"
            className="rounded-surface border border-slate-200 p-4 dark:border-slate-700"
          >
            <Bone text="text-supporting" width="w-20" />
            <Bone text="text-page-title" width="w-16" className="mt-1" />
            <Bone text="text-supporting" width="w-28" className="mt-0.5" />
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <Bone text="text-body" width="w-56" />
          <Bone text="text-supporting" width="w-28" />
        </div>
        <div className={`mt-4 h-40 rounded-surface ${PULSE}`} />
      </div>
    </div>
  );
}

// ViewTabs' row: Dashboard and Search on their own, the three Detail tabs in their bar.
function ViewTabsSkeleton() {
  const tab = (width: string, i: number) => (
    <span
      key={i}
      data-skeleton="tab"
      className={`h-field shrink-0 rounded-menu pointer-coarse:h-10 ${width} ${PULSE}`}
    />
  );
  return (
    <div className="mt-8 flex items-center gap-3">
      <div className={`${BAR} shrink-0`}>{['w-24', 'w-20'].map(tab)}</div>
      <div className={`${BAR} min-w-0 flex-1`}>{['w-24', 'w-28', 'w-20'].map(tab)}</div>
    </div>
  );
}

// MetricCard's shape: icon, title and event, the count, a two-line blurb, the trend line.
function MetricCardSkeleton() {
  return (
    <div data-skeleton="metric-card" className={`flex h-full flex-col p-6 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`mt-0.5 size-field shrink-0 rounded-menu ${PULSE}`} />
          <div className="min-w-0 flex-1">
            <Bone text="text-body" width="w-28" />
            <Bone text="text-supporting" width="w-36" />
          </div>
        </div>
        <Bone text="text-page-title" width="w-12" />
      </div>
      <Bone text="text-supporting" width="w-full" className="mt-3" />
      <Bone text="text-supporting" width="w-3/4" />
      <div className="mt-auto pt-4">
        <div className={`h-20 rounded-menu ${PULSE}`} />
      </div>
    </div>
  );
}

// The groups a tab opens on: At a Glance's six plain cards, then a first group of chart stacks.
const GROUP_SIZES = [6, 3];

// A tab's intro line and its groups of cards (DashboardView, MetricGroups).
function TabSkeleton() {
  return (
    <div className="mt-8">
      <Bone text="text-body" width="w-full max-w-xl" />
      <div className="mt-6 flex flex-col gap-6">
        {GROUP_SIZES.map((size, g) => (
          <section key={g}>
            <Bone text="text-supporting" width="w-28" />
            <div className={`mt-3 ${GRID}`}>
              {Array.from({ length: size }, (_, i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton({ variant }: { variant: 'page' | 'view' }) {
  return (
    <div aria-busy="true" data-testid="telemetry-skeleton">
      <p role="status" className="sr-only">
        Loading the numbers…
      </p>
      <div aria-hidden="true">
        {variant === 'page' ? (
          <>
            <div className="mt-10">
              <WindowPanelSkeleton />
            </div>
            <ViewTabsSkeleton />
          </>
        ) : null}
        <TabSkeleton />
      </div>
    </div>
  );
}
