// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySummary } from '@livedoc/api-schema';
import { ActiveView } from './ActiveView';
import TelemetryDashboard from './page';
import { DashboardSkeleton } from './DashboardSkeleton';

// docs/specs/017-telemetry/telemetry.md "Dashboard app": while the numbers load, a skeleton holds
// their place, never an empty page.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe('the telemetry dashboard while its numbers load', () => {
  it('shows the skeleton, busy and announced, never a lone loading line', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    act(() => root!.render(<TelemetryDashboard />));
    const skeleton = host!.querySelector('[data-testid="telemetry-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton!.getAttribute('aria-busy')).toBe('true');
    expect(skeleton!.querySelector('[role="status"]')?.textContent).toBe('Loading the numbers…');
    expect(host!.textContent).not.toContain('Loading…');
  });
});

describe('a Detail tab while its code downloads', () => {
  it("holds the tab's place with the skeleton", () => {
    const empty = { total: 0, rows: [] };
    const summary: TelemetrySummary = {
      enabled: true,
      generatedAt: 1,
      windows: { today: empty, last7: empty, last30: empty },
      daily: { days: [0, 1, 2], totals: [0, 0, 0], byCategory: {}, byMetric: {} },
    };
    act(() =>
      root!.render(
        <ActiveView
          view="health"
          summary={summary}
          active="last7"
          focus={null}
          onOpenSection={() => {}}
        />,
      ),
    );
    expect(host!.querySelector('[data-testid="telemetry-skeleton"]')).not.toBeNull();
  });
});

describe('DashboardSkeleton', () => {
  it('stands in for the timeframe panel, the view tabs and the first groups of cards', () => {
    act(() => root!.render(<DashboardSkeleton variant="page" />));
    const shapes = host!.querySelector('[aria-hidden="true"]')!;
    expect(shapes.querySelectorAll('[data-skeleton="window-tile"]')).toHaveLength(3);
    expect(shapes.querySelectorAll('[data-skeleton="tab"]')).toHaveLength(5);
    expect(shapes.querySelectorAll('[data-skeleton="metric-card"]').length).toBeGreaterThan(0);
  });

  it("holds a tab's place with its cards alone while the tab's code downloads", () => {
    act(() => root!.render(<DashboardSkeleton variant="view" />));
    const shapes = host!.querySelector('[aria-hidden="true"]')!;
    expect(shapes.querySelectorAll('[data-skeleton="window-tile"]')).toHaveLength(0);
    expect(shapes.querySelectorAll('[data-skeleton="tab"]')).toHaveLength(0);
    expect(shapes.querySelectorAll('[data-skeleton="metric-card"]').length).toBeGreaterThan(0);
  });

  it('stops its pulse under reduced motion', () => {
    act(() => root!.render(<DashboardSkeleton variant="page" />));
    const pulsing = host!.querySelectorAll('.animate-pulse');
    expect(pulsing.length).toBeGreaterThan(0);
    for (const el of pulsing) expect(el.className).toContain('motion-reduce:animate-none');
  });
});
