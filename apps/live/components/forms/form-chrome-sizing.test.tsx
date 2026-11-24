// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FormLinkState } from '@/hooks/forms/useFormLink';
import { SheetBar } from '@/components/spreadsheet/SheetBar';
import { FormLockedStrip } from './FormLockedStrip';
import { FormProblems } from './FormProblems';
import { FormStatusBar } from './FormStatusBar';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

const link = (open: boolean) =>
  ({
    status: 'ready',
    link: {
      link: { code: 'c', open, createdAt: 0 },
      responses: 3,
      unseen: 1,
      suspendedAt: null,
      canPublish: true,
    },
  }) as unknown as FormLinkState;

// docs/specs/004-interface-design/sizing.md "Chrome is everything that is not content" with D237: a form's chrome
// (status bar, strips, problems) is on the scale; the form as respondents see it is not. A sheet's bar likewise.
describe('a form’s chrome on the sizing scale', () => {
  it('reads the status bar at 14 px with a 24 px state chip at 12 px and a 32 px Problems button', () => {
    render(
      <FormStatusBar
        link={link(true)}
        problem={null}
        canEdit
        onFix={() => {}}
        problems={2}
        onProblems={() => {}}
      />,
    );

    const bar = document.querySelector('[data-form-status]')!;
    expect(bar.className).toContain('text-body');
    expect(bar.className).toContain('rounded-surface');
    const pill = screen.getByText('Accepting Responses');
    expect(pill.className).toContain('h-chip');
    expect(pill.className).toContain('text-supporting');
    expect(screen.getByRole('button', { name: 'Problems with this Form' }).className).toContain(
      'h-field',
    );
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the locked strip at 14 px with a 32 px Edit Form in regular weight', () => {
    render(<FormLockedStrip onEdit={() => {}} busy={false} />);

    expect(screen.getByRole('status').className).toContain('text-body');
    const edit = screen.getByRole('button', { name: 'Edit Form' }).className;
    expect(edit).toContain('h-field');
    expect(edit).not.toContain('font-medium');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('lists problems at 14 px under a regular title', () => {
    render(<FormProblems title="Before publishing:" problem="no_destination" notReady={[]} />);

    expect(screen.getByRole('status').className).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});

describe('a sheet’s bar on the sizing scale', () => {
  it('names its sheets at 14 px, medium only on the open one', () => {
    render(
      <SheetBar
        tabs={[
          { id: 't1', name: 'Sheet1' },
          { id: 't2', name: 'Costs' },
        ]}
        activeId="t1"
        onSelect={() => {}}
      />,
    );

    const open = screen.getByRole('tab', { name: 'Sheet1' }).className;
    const other = screen.getByRole('tab', { name: 'Costs' }).className;
    expect(open).toContain('text-body');
    expect(open).toContain('font-medium');
    expect(other).toContain('text-body');
    expect(other).not.toContain('font-medium');
  });
});
