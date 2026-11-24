// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamInvite } from '@/lib/api-client';
import { TeamInvitesPane } from './TeamInvitesPane';
import { TeamLibraryHeader } from './TeamLibraryHeader';
import { TimelineEmptyState } from './TimelineEmptyState';
import { TrashPane } from './TrashPane';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

const trashed = (id: string, name: string) => ({
  id,
  name,
  teamId: null,
  teamName: null,
  trashedAt: Date.now(),
  purgeAt: Date.now() + 86_400_000,
  reason: 'deleted' as const,
});

const invite = {
  memberId: 'm1',
  team: { id: 't1', name: 'Design guild', organisation: 'Acme' },
  memberCount: 3,
} as TeamInvite;

// docs/specs/004-interface-design/sizing.md: a section's title is 16 px regular, everything read or pressed is 14 px on
// a 28 px row, supporting lines are 12 px, and nothing is set semibold or in tracked capitals.
describe('team, trash and timeline panes on the sizing scale', () => {
  it('titles a Trash group at the panel title step and draws its actions as 28 px rows', () => {
    render(
      <TrashPane
        trash={{
          listing: { cloud: [trashed('c1', 'Cloud plan')], local: [] },
          restore: vi.fn(),
          purge: vi.fn(),
          empty: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole('heading', { level: 2 }).className).toContain('text-panel-title');
    expect(screen.getByText('Cloud plan').className).toContain('text-body');
    for (const name of ['Empty Trash', 'Delete Cloud plan permanently', 'Restore Cloud plan']) {
      const button = screen.getByRole('button', { name }).className;
      expect(button).toMatch(/\b(min-)?h-row\b/);
      expect(button).toContain('text-body');
    }
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws an invite card with 28 px Decline and Accept at the reading size', () => {
    render(<TeamInvitesPane invites={[invite]} onAccept={vi.fn()} onDecline={vi.fn()} />);

    expect(screen.getByText('Design guild').className).toContain('text-body');
    expect(screen.getByText('Acme · 3 members').className).toContain('text-supporting');
    for (const name of ['Decline', 'Accept']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-row');
    }
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('sets the team library crumbs at the reading size in their own case', () => {
    render(
      <TeamLibraryHeader
        crumbs={[{ label: 'Shared documents', onClick: () => {} }, { label: 'Briefs' }]}
        teamId="t1"
        currentFolderId="f1"
        inFolder
        viewMode="list"
        setViewMode={() => {}}
        createFolder={async () => undefined}
        setRenamingFolderId={() => {}}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Team folders' }).className).toContain(
      'text-body',
    );
    expect(screen.getByRole('button', { name: 'Shared documents' }).className).toContain(
      'rounded-control',
    );
    expect(screen.getByRole('button', { name: /Create/ }).className).toContain('min-h-row');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('gives the empty Timeline the Explorer empty state call to action', () => {
    render(<TimelineEmptyState />);

    const cta = screen.getByRole('link', { name: 'New Document' }).className;
    expect(cta).toContain('min-h-prominent');
    expect(cta).toContain('text-body');
    expect(cta).toContain('font-medium');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
