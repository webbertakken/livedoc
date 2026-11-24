// @vitest-environment jsdom
// docs/specs/004-interface-design/sizing.md (D239): a Dashboard tab is chrome on the sizing scale. Its Title card is
// the page's title, a written card's heading a section's, and nothing on them is heavy or set in tracked capitals.
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardChecklistCard } from './DashboardChecklistCard';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import { DashboardKeyDateCard } from './DashboardKeyDateCard';
import { DashboardLinksCard } from './DashboardLinksCard';
import { DashboardNote } from './DashboardNote';
import { DashboardStatusCard } from './DashboardStatusCard';
import { DashboardTitle } from './DashboardTitle';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

function show(card: ReactNode, canEdit: boolean) {
  const value = {
    tabs: [],
    elements: new Map(),
    canEdit,
    actions: { setSlotContent: vi.fn() },
    openTab: vi.fn(),
    tabStatus: () => 'loaded',
    retryTab: vi.fn(),
  } as unknown as DashboardContextValue;
  return render(<DashboardContext.Provider value={value}>{card}</DashboardContext.Provider>)
    .container;
}

const CARDS: [string, ReactNode][] = [
  ['Title', <DashboardTitle key="t" slotId="s" title={{ title: 'Launch', text: 'What ships' }} />],
  ['Note', <DashboardNote key="n" slotId="s" note={{ title: 'Risks', text: 'Few' }} />],
  [
    'Status',
    <DashboardStatusCard key="st" slotId="s" status={{ state: 'on-track', text: 'Fine', at: 0 }} />,
  ],
  [
    'Checklist',
    <DashboardChecklistCard
      key="c"
      slotId="s"
      checklist={{ title: 'Steps', items: [{ id: 'i', text: 'One', done: true }] }}
    />,
  ],
  [
    'Key Date',
    <DashboardKeyDateCard key="k" slotId="s" keyDate={{ title: 'Launch', date: '2026-12-01' }} />,
  ],
  [
    'Links',
    <DashboardLinksCard
      key="l"
      slotId="s"
      links={{ title: 'Links', links: [{ id: 'a', label: 'Site', url: 'https://example.com' }] }}
    />,
  ],
];

describe('a Dashboard’s written cards on the sizing scale', () => {
  it.each(CARDS)('draws a %s card with nothing heavy or in tracked capitals', (_, card) => {
    for (const canEdit of [true, false]) {
      expect(show(card, canEdit).innerHTML).not.toMatch(TRACKED_OR_HEAVY);
      cleanup();
    }
  });

  it('heads a Title card as the page’s title over a 14 px line', () => {
    const viewing = show(CARDS[0]![1], false);
    expect(viewing.querySelector('h2')!.className).toContain('text-page-title');
    expect(viewing.querySelector('p')!.className).toContain('text-body');
  });

  it('heads a Note as a section, over its text at 14 px', () => {
    const viewing = show(CARDS[1]![1], false);
    expect(viewing.querySelector('h3')!.className).toContain('text-panel-title');
    expect(viewing.querySelector('p')!.className).toContain('text-body');
  });

  it('heads a written card as a section', () => {
    const viewing = show(CARDS[4]![1], false);
    expect(viewing.querySelector('h3')!.className).toContain('text-panel-title');
  });
});
