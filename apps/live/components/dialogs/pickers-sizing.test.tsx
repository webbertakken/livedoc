// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignActionDialog } from './AssignActionDialog';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/document/d1' }));

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a dialog's title is 22 px regular, fields and their labels read at
// 14 px, supporting text is 12 px, and nothing is set semibold or in tracked capitals.
describe('the Assign Action dialog on the sizing scale', () => {
  it('titles the dialog at the dialog title step and reads its fields at 14 px', () => {
    render(
      <AssignActionDialog
        open
        existing={null}
        elementLabel="Retry budget"
        teams={[]}
        ownerId={null}
        selfUserId="me"
        selfName="Ada"
        documentId="d1"
        documentTeamId={null}
        emailEnabled={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 2 }).className).toContain('text-dialog-title');
    expect(screen.getByText('Assignee').className).toContain('text-body');
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('size-row');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
