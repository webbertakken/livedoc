// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SECTION_HEADING, SECTION_LINK } from './home/home-styles';
import { InboxFailedState } from './inbox/inbox-states';
import { InboxFilterBar } from './inbox/InboxRows';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a section's title is 16 px regular, everything read or pressed is 14 px,
// a row-sized control is 28 px, a primary action is the 36 px prominent step, and medium marks only the chosen one.
describe('Home and Inbox on the sizing scale', () => {
  it('titles a Home section at the panel title step and its link at the reading size', () => {
    expect(SECTION_HEADING).toContain('text-panel-title');
    expect(SECTION_HEADING).not.toMatch(TRACKED_OR_HEAVY);
    expect(SECTION_LINK).toContain('text-body');
  });

  it('draws the Inbox filters as 28 px pills at the reading size, medium only on the chosen one', () => {
    render(
      <InboxFilterBar
        filter="all"
        counts={{ all: 3, mine: 1, waiting: 0, comments: 2, forms: 0 }}
        onChange={() => {}}
        stacked={false}
      />,
    );

    const chosen = screen.getByRole('button', { pressed: true }).className;
    expect(chosen).toContain('min-h-row');
    expect(chosen).toContain('text-body');
    expect(chosen).toContain('font-medium');
    for (const other of screen.getAllByRole('button', { pressed: false }))
      expect(other.className).not.toContain('font-medium');
  });

  it('offers a failed read again as a prominent primary action over 14 px copy', () => {
    render(<InboxFailedState onRetry={() => {}} />);

    expect(screen.getByRole('button').className).toContain('min-h-prominent');
    expect(document.body.innerHTML).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
