// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListing } from '@/lib/api-client';

// /new's Jump Back In (docs/specs/007-editor/new-document-route.md; docs/specs/019-marketing/returning-visitor.md):
// your newest documents and your teams', merged by save, a team one marked with its team.

const listing = vi.hoisted(() => ({ current: null as DocumentListing | null }));
vi.mock('@/lib/api-client', () => ({
  apiListDocumentsWithTeamRecent: async () => listing.current,
}));
vi.mock('@/hooks/persistence/useAfterDriveChange', () => ({ useAfterDriveChange: () => {} }));

import { RecentDocumentsCard } from './RecentDocumentsCard';

afterEach(cleanup);

const summary = (id: string, savedAt: number) =>
  ({ id, name: `Doc ${id}`, savedAt, empty: false }) as DocumentListing['documents'][number];

describe('RecentDocumentsCard', () => {
  it('merges team documents by save time and marks them', async () => {
    listing.current = {
      documents: [summary('mine', 1)],
      teamRecent: [{ ...summary('team', 2), teamName: 'Design' }],
    };
    render(<RecentDocumentsCard ownerId="owner" />);

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3));
    const [team, mine] = screen.getAllByRole('link');
    expect(team!.getAttribute('href')).toBe('/document/team');
    expect(team!.textContent).toContain('Design team: Doc team');
    expect(mine!.getAttribute('href')).toBe('/document/mine');
    expect(mine!.textContent).not.toContain('team:');
  });
});

// docs/specs/004-interface-design/sizing.md: names at the body step, regular; the heading in its own case.
describe('RecentDocumentsCard on the sizing scale', () => {
  it('names each document at the body step and heads the card without tracked capitals', async () => {
    listing.current = { documents: [summary('mine', 1)], teamRecent: [] };
    const { container } = render(<RecentDocumentsCard ownerId="owner" />);
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
    const name = screen.getByText('Doc mine').parentElement!;
    expect(name.className.split(/\s+/)).toContain('text-body');
    expect(name.className).not.toMatch(/font-(medium|semibold)/);
    expect(container.querySelector('.uppercase')).toBeNull();
    expect(container.firstElementChild!.className.split(/\s+/)).toContain('rounded-surface');
  });
});
