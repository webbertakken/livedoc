// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

// docs/specs/004-interface-design/empty-states.md "The look" and sizing.md "Type": a page's empty state titles at the
// panel title step over 14 px copy, a pane's at the reading size over 12 px, both regular.
describe('EmptyState', () => {
  it('titles a page empty state at the panel title step over body copy', () => {
    render(<EmptyState icon={null} title="No documents yet" description="Make one to begin." />);

    const title = screen.getByRole('heading', { name: 'No documents yet' }).className;
    expect(title).toContain('text-panel-title');
    expect(title).not.toContain('font-semibold');
    expect(screen.getByText('Make one to begin.').className).toContain('text-body');
  });

  it('titles a compact empty state at the reading size over supporting copy', () => {
    render(
      <EmptyState compact icon={null} title="No documents yet" description="Make one to begin." />,
    );

    const title = screen.getByRole('heading', { name: 'No documents yet' }).className;
    expect(title).toContain('text-body');
    expect(title).not.toContain('font-semibold');
    expect(screen.getByText('Make one to begin.').className).toContain('text-supporting');
  });
});
