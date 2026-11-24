// @vitest-environment jsdom
// docs/specs/004-interface-design/sizing.md (D239): a Form metric's chrome is on the sizing scale; its figure is drawn
// art, named once (dashboard.css dashboard-figure).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormMetricContent, FormMetricKind } from '@livedoc/document';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import { DashboardFormMetric } from './DashboardFormMetric';

let code: string | null = null;
vi.mock('@/components/forms/form-board-context', () => ({
  useFormBoard: () => ({
    documentId: 'd',
    ownerId: 'o',
    share: null,
    online: true,
    canShare: true,
  }),
}));
vi.mock('@/hooks/forms/useFormLink', () => ({
  useFormLink: () => ({ status: 'ready', link: code ? { link: { code } } : null }),
}));
afterEach(() => {
  cleanup();
  code = null;
});

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;
const FORMS = [
  { id: 'f1', kind: 'form', name: 'Survey' },
  { id: 'f2', kind: 'form', name: 'Signup' },
];

function show(metric: FormMetricKind, formTabId: string, canEdit = true, forms = FORMS) {
  const value = {
    tabs: forms,
    elements: new Map(),
    canEdit,
    actions: { setSlotContent: vi.fn() },
    openTab: vi.fn(),
    tabStatus: () => 'loaded',
    retryTab: vi.fn(),
  } as unknown as DashboardContextValue;
  const content: FormMetricContent = { type: 'form-metric', metric, formTabId };
  return render(
    <DashboardContext.Provider value={value}>
      <DashboardFormMetric slotId="s" content={content} />
    </DashboardContext.Provider>,
  ).container;
}

describe('a Form metric on the sizing scale', () => {
  it('draws its figure as the dashboard’s figure and its chrome with nothing heavy', () => {
    const tile = show('responses', 'f1');
    expect(tile.querySelector('.dashboard-figure')).not.toBeNull();
    expect(tile.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws a status as a regular chip and a link with a 28 px Copy', () => {
    expect(show('status', 'f1', false, FORMS.slice(0, 1)).innerHTML).not.toMatch(TRACKED_OR_HEAVY);
    cleanup();
    code = 'abc';
    const tile = show('link', 'f1');
    expect(screen.getByRole('button', { name: 'Copy' }).className).toContain('h-row');
    expect(tile.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('names a metric with no form yet at 14 px, for an Editor and anyone else', () => {
    for (const canEdit of [true, false]) {
      expect(show('responses', '', canEdit).innerHTML).not.toMatch(TRACKED_OR_HEAVY);
      cleanup();
    }
  });
});
